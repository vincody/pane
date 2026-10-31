//! Token-usage extraction from Codex and Claude session logs, a line-for-line port of `parseTokenLog` in
//! server/src/features/usage/token-usage.ts. Logs run to gigabytes, so lines that cannot hold usage are skipped as raw bytes
//! and only the few that can are parsed. Message text is never kept, only counters.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};

use memchr::memmem::Finder;
use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Task};
use napi_derive::napi;
use serde_json::{json, Map, Value};

const MAX_SAFE: u64 = 9_007_199_254_740_991;

/// `Number.isSafeInteger(v) && v >= 0 ? v : 0`
fn count(value: Option<&Value>) -> u64 {
    match value {
        Some(Value::Number(number)) => {
            if let Some(whole) = number.as_u64() {
                if whole <= MAX_SAFE { whole } else { 0 }
            } else if let Some(float) = number.as_f64() {
                if float >= 0.0 && float.fract() == 0.0 && float <= MAX_SAFE as f64 { float as u64 } else { 0 }
            } else {
                0
            }
        }
        _ => 0,
    }
}

#[derive(Clone, Copy, Default, PartialEq)]
struct Counters { input: u64, output: u64, cache_read: u64, cache_write: u64, total: u64 }

impl Counters {
    fn max(self, other: Counters) -> Counters {
        Counters {
            input: self.input.max(other.input), output: self.output.max(other.output), cache_read: self.cache_read.max(other.cache_read),
            cache_write: self.cache_write.max(other.cache_write), total: self.total.max(other.total),
        }
    }
    fn to_json(self) -> Value {
        json!({"input": self.input, "output": self.output, "cacheRead": self.cache_read, "cacheWrite": self.cache_write, "total": self.total})
    }
    /// The text `JSON.stringify` gives for the same counters, which the JS side puts in the de-duplication key.
    fn key_text(self) -> String {
        format!("{{\"input\":{},\"output\":{},\"cacheRead\":{},\"cacheWrite\":{},\"total\":{}}}", self.input, self.output, self.cache_read, self.cache_write, self.total)
    }
}

struct Entry { key: String, session: String, at: i64, counters: Counters }

fn object(value: Option<&Value>) -> &Map<String, Value> {
    static EMPTY: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    match value { Some(Value::Object(map)) => map, _ => EMPTY.get_or_init(Map::new) }
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// `Date.parse` for the ISO 8601 times these logs carry (`2026-10-31T10:22:38.123Z`, or with a `+hh:mm` offset), in milliseconds.
/// Anything else is `None`, which the caller treats like `NaN`.
fn parse_time(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    let number = |from: usize, to: usize| -> Option<i64> { std::str::from_utf8(bytes.get(from..to)?).ok()?.parse().ok() };
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || !(bytes[10] == b'T' || bytes[10] == b't') || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let (year, month, day, hour, minute, second) = (number(0, 4)?, number(5, 7)?, number(8, 10)?, number(11, 13)?, number(14, 16)?, number(17, 19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 24 || minute > 59 || second > 59 {
        return None;
    }
    let mut index = 19;
    let mut millis = 0;
    if bytes.get(index) == Some(&b'.') {
        let start = index + 1;
        index = start;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) { index += 1; }
        if index == start { return None; }
        let digits = &text[start..index.min(start + 3)];
        millis = digits.parse::<i64>().ok()? * 10_i64.pow(3 - digits.len() as u32);
    }
    let offset_minutes = match bytes.get(index)? {
        b'Z' | b'z' if index + 1 == bytes.len() => 0,
        sign @ (b'+' | b'-') if index + 6 == bytes.len() && bytes[index + 3] == b':' => {
            let minutes = number(index + 1, index + 3)? * 60 + number(index + 4, index + 6)?;
            if *sign == b'-' { -minutes } else { minutes }
        }
        _ => return None,
    };
    let seconds = days_from_civil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(seconds * 1_000 + millis)
}

/// Returns `{"entries":[...],"partial":bool}` for one log file.
pub fn parse_log(path: &str, provider: &str) -> std::io::Result<String> {
    let claude = provider == "claude";
    let mut session = std::path::Path::new(path).file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_default();
    let (token_count, session_meta, usage_field) = (Finder::new("token_count"), Finder::new("session_meta"), Finder::new("\"usage\""));
    let mut reader = BufReader::with_capacity(256 * 1024, File::open(path)?);
    let mut line = Vec::new();
    let mut entries: Vec<Entry> = Vec::new();
    let mut messages: Vec<Entry> = Vec::new();
    let mut message_index: HashMap<String, usize> = HashMap::new();
    let mut previous = Counters::default();
    let mut partial = false;

    loop {
        line.clear();
        if reader.read_until(b'\n', &mut line)? == 0 { break; }
        if !(token_count.find(&line).is_some() || session_meta.find(&line).is_some() || (claude && usage_field.find(&line).is_some())) { continue; }
        let text = String::from_utf8_lossy(&line);
        let Ok(row) = serde_json::from_str::<Value>(text.trim_end_matches(['\r', '\n'])) else { partial = true; continue; };
        let row = object(Some(&row));
        let payload = object(row.get("payload"));
        let kind = row.get("type").and_then(Value::as_str);
        if !claude && kind == Some("session_meta") {
            if let Some(id) = payload.get("id").and_then(Value::as_str) { session = id.to_owned(); }
            continue;
        }
        let at = row.get("timestamp").and_then(Value::as_str).and_then(parse_time);
        if !claude {
            if kind != Some("event_msg") || payload.get("type").and_then(Value::as_str) != Some("token_count") { continue; }
            let usage = object(object(payload.get("info")).get("total_token_usage"));
            if usage.is_empty() { continue; }
            let current = Counters {
                input: count(usage.get("input_tokens")), output: count(usage.get("output_tokens")), cache_read: count(usage.get("cached_input_tokens")),
                cache_write: count(usage.get("cache_write_input_tokens")), total: count(usage.get("total_tokens")),
            };
            // Codex totals are cumulative; the entry is what was added since the last one.
            let delta = Counters {
                input: current.input.saturating_sub(previous.input), output: current.output.saturating_sub(previous.output),
                cache_read: current.cache_read.saturating_sub(previous.cache_read), cache_write: current.cache_write.saturating_sub(previous.cache_write),
                total: current.total.saturating_sub(previous.total),
            };
            previous = previous.max(current);
            if delta.total == 0 { continue; }
            let Some(at) = at else { partial = true; continue; };
            entries.push(Entry { key: format!("{session}:{}", current.key_text()), session: session.clone(), at, counters: delta });
        } else {
            let message = object(row.get("message"));
            let usage = object(message.get("usage"));
            if kind != Some("assistant") || usage.is_empty() { continue; }
            if let Some(id) = row.get("sessionId").and_then(Value::as_str) { session = id.to_owned(); }
            let (Some(id), Some(at)) = (message.get("id").and_then(Value::as_str), at) else { partial = true; continue; };
            let cache_read = count(usage.get("cache_read_input_tokens"));
            let cache_write = count(usage.get("cache_creation_input_tokens"));
            // Claude reports ordinary input and cache separately: the total includes each once.
            let input = count(usage.get("input_tokens")) + cache_read + cache_write;
            let output = count(usage.get("output_tokens"));
            let counters = Counters { input, output, cache_read, cache_write, total: input + output };
            let key = format!("{session}:{id}");
            match message_index.get(&key) {
                Some(&position) => {
                    let old = &messages[position];
                    messages[position] = Entry { key, session: session.clone(), at: old.at, counters: old.counters.max(counters) };
                }
                None => { message_index.insert(key.clone(), messages.len()); messages.push(Entry { key, session: session.clone(), at, counters }); }
            }
        }
    }
    let list = if claude { messages } else { entries };
    let rows: Vec<Value> = list.iter().map(|entry| json!({"key": entry.key, "session": entry.session, "at": entry.at, "counters": entry.counters.to_json()})).collect();
    Ok(json!({"entries": rows, "partial": partial}).to_string())
}

pub struct TokenLogTask { path: String, provider: String }

impl Task for TokenLogTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> {
        parse_log(&self.path, &self.provider).map_err(|error| napi::Error::from_reason(format!("Could not read {}: {error}", self.path)))
    }
    fn resolve(&mut self, _env: Env, output: String) -> napi::Result<String> { Ok(output) }
}

/// Parses one log on a background thread; resolves to the JSON described on `parse_log`, or rejects if the file cannot be read.
#[napi]
pub fn parse_token_log(path: String, provider: String) -> AsyncTask<TokenLogTask> {
    AsyncTask::new(TokenLogTask { path, provider })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_match_date_parse() {
        assert_eq!(parse_time("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_time("2025-10-31T10:22:38.123Z"), Some(1_761_906_158_123));
        assert_eq!(parse_time("2025-10-31T10:22:38.1Z"), Some(1_761_906_158_100));
        assert_eq!(parse_time("2025-10-31T10:22:38.123456Z"), Some(1_761_906_158_123));
        assert_eq!(parse_time("2025-10-31T17:22:38+07:00"), Some(1_761_906_158_000));
        assert_eq!(parse_time("2000-02-29T00:00:00Z"), Some(951_782_400_000));
        assert_eq!(parse_time("not a time"), None);
        assert_eq!(parse_time("2025-10-31T10:22:38"), None);
    }

    #[test]
    fn counts_follow_the_js_rule() {
        assert_eq!(count(Some(&json!(5))), 5);
        assert_eq!(count(Some(&json!(5.0))), 5);
        assert_eq!(count(Some(&json!(-1))), 0);
        assert_eq!(count(Some(&json!(1.5))), 0);
        assert_eq!(count(Some(&json!("7"))), 0);
        assert_eq!(count(Some(&json!(9_007_199_254_740_992u64))), 0);
        assert_eq!(count(None), 0);
    }

    fn write(name: &str, body: &str) -> String {
        let path = std::env::temp_dir().join(format!("pane-native-{}-{name}", std::process::id()));
        std::fs::write(&path, body).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn codex_totals_become_deltas_and_malformed_lines_mark_the_result_partial() {
        let path = write("codex.jsonl", concat!(
            "{\"type\":\"session_meta\",\"payload\":{\"id\":\"abc\"}}\n",
            "{\"timestamp\":\"2025-10-31T10:00:00.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":10,\"output_tokens\":2,\"cached_input_tokens\":4,\"total_tokens\":12}}}}\n",
            "{\"timestamp\":\"2025-10-31T10:01:00.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":25,\"output_tokens\":5,\"cached_input_tokens\":4,\"total_tokens\":30}}}}\n",
            "token_count but not json\n",
            "{\"unrelated\":true}\n",
        ));
        let parsed: Value = serde_json::from_str(&parse_log(&path, "codex").unwrap()).unwrap();
        let entries = parsed["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["session"], "abc");
        assert_eq!(entries[0]["counters"]["total"], 12);
        assert_eq!(entries[1]["counters"]["total"], 18);
        assert_eq!(entries[1]["counters"]["cacheRead"], 0);
        assert_eq!(entries[1]["key"], "abc:{\"input\":25,\"output\":5,\"cacheRead\":4,\"cacheWrite\":0,\"total\":30}");
        assert_eq!(parsed["partial"], true);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn claude_messages_merge_by_the_largest_counters_and_keep_their_first_time() {
        let usage = |output: u32| format!("{{\"type\":\"assistant\",\"sessionId\":\"s1\",\"timestamp\":\"2025-10-31T10:00:0{output}.000Z\",\"message\":{{\"id\":\"m1\",\"usage\":{{\"input_tokens\":3,\"cache_read_input_tokens\":100,\"cache_creation_input_tokens\":7,\"output_tokens\":{output}}}}}}}\n");
        let path = write("claude.jsonl", &format!("{}{}", usage(1), usage(9)));
        let parsed: Value = serde_json::from_str(&parse_log(&path, "claude").unwrap()).unwrap();
        let entries = parsed["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["key"], "s1:m1");
        assert_eq!(entries[0]["counters"]["output"], 9);
        assert_eq!(entries[0]["counters"]["input"], 110);
        assert_eq!(entries[0]["counters"]["total"], 119);
        assert_eq!(entries[0]["at"], 1_761_904_801_000_i64); // the first message's time, not the later update's
        std::fs::remove_file(path).ok();
    }
}
