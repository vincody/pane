//! Process and listening-port discovery for Pane's backend. On Windows both used to cost a PowerShell or `netstat` process per
//! call; here they are direct system calls. Results are returned as JSON text in the shape the TypeScript callers already read.

mod token_usage;

use napi_derive::napi;
use serde_json::{json, Value};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// A command line as Windows would show it: arguments with spaces are quoted again after sysinfo split them.
fn command_line(arguments: &[std::ffi::OsString]) -> String {
    arguments
        .iter()
        .map(|argument| {
            let text = argument.to_string_lossy();
            if text.is_empty() || text.contains([' ', '\t']) { format!("\"{text}\"") } else { text.into_owned() }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Seconds since the Unix epoch as an ISO 8601 UTC time, written like .NET's "o" format that `Get-CimInstance` rows carried.
fn iso_time(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 { shifted_month + 3 } else { shifted_month - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.0000000Z", rest / 3_600, rest % 3_600 / 60, rest % 60)
}

/// Working set and cumulative kernel and user CPU time, in bytes and 100 ns units, for one process.
/// Opening with only limited-query rights is enough, and still works for protected processes (Defender, dwm) that a full
/// open is refused for, which is why sysinfo reports 0 for them.
#[cfg(windows)]
fn limited_usage(pid: u32) -> Option<(u64, u64, u64)> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    let ticks = |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let memory = if K32GetProcessMemoryInfo(handle, &mut counters, counters.cb) != 0 { counters.WorkingSetSize as u64 } else { 0 };
        let (mut created, mut exited, mut kernel, mut user): (FILETIME, FILETIME, FILETIME, FILETIME) = std::mem::zeroed();
        let times = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0;
        CloseHandle(handle);
        Some((memory, if times { ticks(kernel) } else { 0 }, if times { ticks(user) } else { 0 }))
    }
}

/// Memory and CPU time for a process, from the system when it allows and from sysinfo otherwise.
fn usage(pid: u32, process: &sysinfo::Process) -> (u64, u64, u64) {
    #[cfg(windows)]
    if let Some(found) = limited_usage(pid) {
        return found;
    }
    let _ = pid;
    (process.memory(), 0, 0)
}

/// Every process as `{ProcessId, ParentProcessId, Name, CommandLine, CreationDate, WorkingSetSize, KernelModeTime, UserModeTime}`.
/// CPU times are cumulative, in 100 ns units like WMI's.
#[napi]
pub fn list_processes() -> napi::Result<String> {
    let mut system = System::new().map_err(|error| napi::Error::from_reason(format!("Could not read the process list: {error}")))?;
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_memory().with_cmd(UpdateKind::Always),
    );
    let rows: Vec<Value> = system
        .processes()
        .iter()
        .map(|(pid, process)| {
            let (memory, kernel, user) = usage(pid.as_u32(), process);
            json!({
                "ProcessId": pid.as_u32(),
                "ParentProcessId": process.parent().map_or(0, |parent| parent.as_u32()),
                "Name": process.name().to_string_lossy(),
                "CommandLine": command_line(process.cmd()),
                "CreationDate": iso_time(process.start_time()),
                "WorkingSetSize": memory,
                "KernelModeTime": kernel,
                "UserModeTime": user,
            })
        })
        .collect();
    Ok(Value::Array(rows).to_string())
}

/// Asks Windows to take the idle pages out of each process's working set. They stay in memory as standby pages and return on
/// first use without disk I/O, so this lowers the memory Task Manager shows for an app nobody is looking at. Returns how many of
/// the processes were trimmed; ones that refuse (other users', protected) are skipped. Does nothing outside Windows.
#[napi]
pub fn trim_working_sets(pids: Vec<u32>) -> u32 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA};
        let mut trimmed = 0;
        for pid in pids {
            unsafe {
                let handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if handle.is_null() {
                    continue;
                }
                if K32EmptyWorkingSet(handle) != 0 {
                    trimmed += 1;
                }
                CloseHandle(handle);
            }
        }
        trimmed
    }
    #[cfg(not(windows))]
    {
        let _ = pids;
        0
    }
}

/// TCP sockets in the LISTEN state as `{pid, host, port}`, IPv4 and IPv6, or an empty list where this is not implemented.
#[napi]
pub fn list_tcp_listeners() -> String {
    Value::Array(listeners()).to_string()
}

#[cfg(windows)]
fn listeners() -> Vec<Value> {
    use std::net::{Ipv4Addr, Ipv6Addr};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
    };
    use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_INET6};

    // The table's size can change between the size query and the read, so retry a few times.
    fn table(family: u32) -> Option<Vec<u8>> {
        let mut size = 0u32;
        for _ in 0..4 {
            let mut buffer = vec![0u8; size as usize];
            let pointer = if size == 0 { std::ptr::null_mut() } else { buffer.as_mut_ptr().cast() };
            let status = unsafe { GetExtendedTcpTable(pointer, &mut size, 0, family, TCP_TABLE_OWNER_PID_LISTENER, 0) };
            match status {
                0 => return Some(buffer),
                122 => continue, // ERROR_INSUFFICIENT_BUFFER: `size` now holds what is needed
                _ => return None,
            }
        }
        None
    }
    // The port sits in the low 16 bits, in network byte order.
    let port = |value: u32| u16::from_be((value & 0xFFFF) as u16);

    let mut found = Vec::new();
    if let Some(buffer) = table(u32::from(AF_INET)) {
        let count = u32::from_ne_bytes(buffer[..4].try_into().unwrap()) as usize;
        let rows = unsafe { std::slice::from_raw_parts(buffer[4..].as_ptr().cast::<MIB_TCPROW_OWNER_PID>(), count) };
        for row in rows {
            let host = Ipv4Addr::from(u32::from_be(row.dwLocalAddr));
            found.push(json!({"pid": row.dwOwningPid, "host": host.to_string(), "port": port(row.dwLocalPort)}));
        }
    }
    if let Some(buffer) = table(u32::from(AF_INET6)) {
        let count = u32::from_ne_bytes(buffer[..4].try_into().unwrap()) as usize;
        let rows = unsafe { std::slice::from_raw_parts(buffer[4..].as_ptr().cast::<MIB_TCP6ROW_OWNER_PID>(), count) };
        for row in rows {
            let host = Ipv6Addr::from(row.ucLocalAddr);
            found.push(json!({"pid": row.dwOwningPid, "host": host.to_string(), "port": port(row.dwLocalPort)}));
        }
    }
    found
}

#[cfg(not(windows))]
fn listeners() -> Vec<Value> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_time_matches_known_dates() {
        assert_eq!(iso_time(0), "1970-01-01T00:00:00.0000000Z");
        assert_eq!(iso_time(951_782_400), "2000-02-29T00:00:00.0000000Z"); // a leap day
        assert_eq!(iso_time(1_761_906_158), "2025-10-31T10:22:38.0000000Z");
    }

    #[test]
    fn arguments_with_spaces_are_quoted_again() {
        let arguments = ["C:\\Program Files\\Pane\\Pane.exe", "--type=renderer", ""].map(std::ffi::OsString::from);
        assert_eq!(command_line(&arguments), "\"C:\\Program Files\\Pane\\Pane.exe\" --type=renderer \"\"");
    }

    #[test]
    fn this_process_is_listed_with_its_parent_and_memory() {
        let rows: Vec<Value> = serde_json::from_str(&list_processes().unwrap()).unwrap();
        let own = rows.iter().find(|row| row["ProcessId"] == std::process::id()).expect("own process is listed");
        assert!(own["WorkingSetSize"].as_u64().unwrap() > 1_000_000);
        assert!(own["ParentProcessId"].as_u64().unwrap() > 0);
    }

    #[cfg(windows)]
    #[test]
    fn a_listening_socket_is_reported_with_its_owner() {
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = socket.local_addr().unwrap().port();
        let rows: Vec<Value> = serde_json::from_str(&list_tcp_listeners()).unwrap();
        assert!(rows.iter().any(|row| row["pid"] == std::process::id() && row["port"] == port && row["host"] == "127.0.0.1"));
    }
}
