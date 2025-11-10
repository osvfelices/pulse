import fsPromises from 'node:fs/promises';
import nodePath from 'node:path';
const print = console.log;
async function readText(filePath) {
  try {
  return (await fsPromises.readFile(filePath, "utf8"));
} catch (e) {
  throw ((("Failed to read file " + filePath) + ": ") + e.message);
}
}
async function writeText(filePath, content) {
  try {
  const dir = nodePath.dirname(filePath);
  (await fsPromises.mkdir(dir, {recursive: true}));
  (await fsPromises.writeFile(filePath, content, "utf8"));
} catch (e) {
  throw ((("Failed to write file " + filePath) + ": ") + e.message);
}
}
async function exists(path) {
  try {
  (await fsPromises.access(path));
  return true;
} catch (e) {
  return false;
}
}
async function readDir(dirPath) {
  try {
  return (await fsPromises.readdir(dirPath));
} catch (e) {
  throw ((("Failed to read directory " + dirPath) + ": ") + e.message);
}
}
async function createDir(dirPath) {
  try {
  (await fsPromises.mkdir(dirPath, {recursive: true}));
} catch (e) {
  throw ((("Failed to create directory " + dirPath) + ": ") + e.message);
}
}
async function removeFile(filePath) {
  try {
  (await fsPromises.unlink(filePath));
} catch (e) {
  throw ((("Failed to remove file " + filePath) + ": ") + e.message);
}
}
async function removeDir(dirPath) {
  try {
  (await fsPromises.rm(dirPath, {recursive: true, force: true}));
} catch (e) {
  throw ((("Failed to remove directory " + dirPath) + ": ") + e.message);
}
}
async function readJson(filePath) {
  try {
  const content = (await readText(filePath));
  return JSON.parse(content);
} catch (e) {
  throw ((("Failed to read JSON file " + filePath) + ": ") + e.message);
}
}
async function writeJson(filePath, data) {
  try {
  const content = JSON.stringify(data, null, 2);
  (await writeText(filePath, content));
} catch (e) {
  throw ((("Failed to write JSON file " + filePath) + ": ") + e.message);
}
}
async function copyFile(source, dest) {
  try {
  (await fsPromises.copyFile(source, dest));
} catch (e) {
  throw ((((("Failed to copy file from " + source) + " to ") + dest) + ": ") + e.message);
}
}
async function stat(path) {
  try {
  const stats = (await fsPromises.stat(path));
  return {isFile: stats.isFile(), isDirectory: stats.isDirectory(), size: stats.size, created: stats.birthtime, modified: stats.mtime};
} catch (e) {
  throw ((("Failed to stat " + path) + ": ") + e.message);
}
}
async function appendText(filePath, content) {
  try {
  (await fsPromises.appendFile(filePath, content, "utf8"));
} catch (e) {
  throw ((("Failed to append to file " + filePath) + ": ") + e.message);
}
}
async function rename(oldPath, newPath) {
  try {
  (await fsPromises.rename(oldPath, newPath));
} catch (e) {
  throw ((((("Failed to rename " + oldPath) + " to ") + newPath) + ": ") + e.message);
}
}
export default {readText: readText, writeText: writeText, exists: exists, readDir: readDir, createDir: createDir, removeFile: removeFile, removeDir: removeDir, readJson: readJson, writeJson: writeJson, copyFile: copyFile, stat: stat, appendText: appendText, rename: rename};
