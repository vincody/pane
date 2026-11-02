//! A workspace's file list for name search. The walk honours `.gitignore` (so build output and dependencies do not crowd out real
//! files), skips symbolic links like the TypeScript walker it replaces, and runs on a background thread. Results are JSON text:
//! `{"files": ["src/a.ts", ...], "truncated": false}` with `/` separators and paths relative to the root.

use std::path::Path;

use ignore::WalkBuilder;
use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Task};
use napi_derive::napi;
use serde_json::json;

/// Directories that are never searched, whatever `.gitignore` says.
const ALWAYS_SKIPPED: [&str; 3] = ["node_modules", ".git", ".ai-web"];
const MAX_DEPTH: usize = 20;

/// Every regular file under `root` as a relative path, up to `limit`. The flag is true when more files existed.
pub fn list_files(root: &Path, limit: usize) -> (Vec<String>, bool) {
    let mut files = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(false) // dotfiles are real files here, as they were for the old walker
        .git_ignore(true)
        .git_exclude(true)
        .git_global(false)
        .parents(true)
        .require_git(false) // a plain folder with a .gitignore is honoured too
        .follow_links(false)
        .max_depth(Some(MAX_DEPTH))
        .filter_entry(|entry| {
            let skipped = entry.file_type().map_or(false, |kind| kind.is_dir()) && entry.file_name().to_str().map_or(false, |name| ALWAYS_SKIPPED.contains(&name));
            !skipped
        })
        .build();
    for entry in walker {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().map_or(false, |kind| kind.is_file()) { continue }
        if files.len() >= limit { return (files, true) }
        let Ok(relative) = entry.path().strip_prefix(root) else { continue };
        let text = relative.to_string_lossy().replace('\\', "/");
        if !text.is_empty() { files.push(text) }
    }
    (files, false)
}

pub struct FileIndexTask { root: String, limit: u32 }

impl Task for FileIndexTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> {
        let root = Path::new(&self.root);
        if !root.is_dir() { return Err(napi::Error::from_reason(format!("Not a folder: {}", self.root))) }
        let (files, truncated) = list_files(root, self.limit as usize);
        Ok(json!({"files": files, "truncated": truncated}).to_string())
    }
    fn resolve(&mut self, _env: Env, output: String) -> napi::Result<String> { Ok(output) }
}

/// Lists a workspace's files on a background thread; rejects when `root` is not a folder.
#[napi]
pub fn list_workspace_files(root: String, limit: u32) -> AsyncTask<FileIndexTask> {
    AsyncTask::new(FileIndexTask { root, limit })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("pane-index-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_nested_files_dotfiles_and_honours_gitignore() {
        let dir = scratch("ignore");
        fs::create_dir_all(dir.join("src/deep")).unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(dir.join("target")).unwrap();
        fs::write(dir.join(".gitignore"), "target/\n*.log\n").unwrap();
        fs::write(dir.join(".env"), "x").unwrap();
        fs::write(dir.join("src/deep/needle.ts"), "x").unwrap();
        fs::write(dir.join("node_modules/pkg/index.js"), "x").unwrap();
        fs::write(dir.join("target/out.bin"), "x").unwrap();
        fs::write(dir.join("debug.log"), "x").unwrap();
        let (mut files, truncated) = list_files(&dir, 100);
        files.sort();
        assert_eq!(files, vec![".env", ".gitignore", "src/deep/needle.ts"]);
        assert!(!truncated);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn stops_at_the_limit_and_says_so() {
        let dir = scratch("limit");
        for index in 0..5 { fs::write(dir.join(format!("f{index}.txt")), "x").unwrap(); }
        let (files, truncated) = list_files(&dir, 3);
        assert_eq!(files.len(), 3);
        assert!(truncated);
        let (all, complete) = list_files(&dir, 5);
        assert_eq!(all.len(), 5);
        assert!(!complete);
        fs::remove_dir_all(dir).ok();
    }
}
