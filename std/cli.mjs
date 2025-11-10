const print = console.log;
function parseArgs(args, options) {
  const result = {_: []};
  const opts = (options || {});
  const aliases = (opts.aliases || {});
  const defaults = (opts.defaults || {});
  const arrays = (opts.arrays || []);
  for (const key in defaults) {
  (result[key] = defaults[key]);
}
  let i = 0;
  while ((i < args.length)) {
  const arg = args[i];
  if ((arg.indexOf("--") == 0)) {
  const flagPart = arg.slice(2);
  let flagName = flagPart;
  let flagValue = true;
  const equalsIndex = flagPart.indexOf("=");
  if ((equalsIndex > (-1))) {
  (flagName = flagPart.slice(0, equalsIndex));
  (flagValue = flagPart.slice((equalsIndex + 1)));
} else {
  if ((((i + 1) < args.length) && (args[(i + 1)].indexOf("-") != 0))) {
  (i = (i + 1));
  (flagValue = args[i]);
}
}
  let isArray = false;
  for (let j = 0; (j < arrays.length); (j = (j + 1))) {
  if ((arrays[j] == flagName)) {
  (isArray = true);
}
}
  if (isArray) {
  if ((!result[flagName])) {
  (result[flagName] = []);
}
  result[flagName].push(flagValue);
} else {
  (result[flagName] = flagValue);
}
  (i = (i + 1));
} else if (((arg.indexOf("-") == 0) && (arg.length > 1))) {
  const flagChar = arg.slice(1);
  let flagName = flagChar;
  if (aliases[flagChar]) {
  (flagName = aliases[flagChar]);
}
  let flagValue = true;
  if ((((i + 1) < args.length) && (args[(i + 1)].indexOf("-") != 0))) {
  (i = (i + 1));
  (flagValue = args[i]);
}
  (result[flagName] = flagValue);
  (i = (i + 1));
} else {
  result._.push(arg);
  (i = (i + 1));
}
}
  return result;
}
function getEnv(name, defaultValue) {
  const value = process.env[name];
  if (((value == null) || (value == undefined))) {
  if (((defaultValue != null) && (defaultValue != undefined))) {
  return defaultValue;
}
  return null;
}
  return value;
}
function prompt(message, options) {
  const opts = (options || {});
  if (opts.defaultValue) {
  return opts.defaultValue;
}
  print(message);
  return "";
}
function spinner(message) {
  let running = false;
  const spinnerObj = {start: function () {
  (running = true);
  print((("[SPINNER] " + message) + " (started)"));
}, stop: function () {
  (running = false);
  print((("[SPINNER] " + message) + " (stopped)"));
}};
  return spinnerObj;
}
function progressBar(options) {
  const opts = (options || {});
  const total = (opts.total || 100);
  const width = (opts.width || 40);
  let current = 0;
  const bar = {update: function (value) {
  (current = value);
  const percent = ((current / total) * 100);
  const filled = ((current / total) * width);
  print((("[PROGRESS] " + percent) + "% complete"));
}, complete: function () {
  (current = total);
  print("[PROGRESS] 100% complete");
}};
  return bar;
}
const colors = {red: function (text) {
  return (("\\x1b[31m" + text) + "\\x1b[0m");
}, green: function (text) {
  return (("\\x1b[32m" + text) + "\\x1b[0m");
}, blue: function (text) {
  return (("\\x1b[34m" + text) + "\\x1b[0m");
}, yellow: function (text) {
  return (("\\x1b[33m" + text) + "\\x1b[0m");
}, magenta: function (text) {
  return (("\\x1b[35m" + text) + "\\x1b[0m");
}, cyan: function (text) {
  return (("\\x1b[36m" + text) + "\\x1b[0m");
}, white: function (text) {
  return (("\\x1b[37m" + text) + "\\x1b[0m");
}, gray: function (text) {
  return (("\\x1b[90m" + text) + "\\x1b[0m");
}, bold: function (text) {
  return (("\\x1b[1m" + text) + "\\x1b[0m");
}, dim: function (text) {
  return (("\\x1b[2m" + text) + "\\x1b[0m");
}};
function table(data) {
  if ((data.length == 0)) {
  return "";
}
  const firstRow = data[0];
  const columns = [];
  for (const key in firstRow) {
  columns.push(key);
}
  let result = "| ";
  for (let i = 0; (i < columns.length); (i = (i + 1))) {
  (result = ((result + columns[i]) + " | "));
}
  (result = (result + "\\n"));
  (result = (result + "|"));
  for (let i = 0; (i < columns.length); (i = (i + 1))) {
  (result = (result + "------|"));
}
  (result = (result + "\\n"));
  for (let i = 0; (i < data.length); (i = (i + 1))) {
  const row = data[i];
  (result = (result + "| "));
  for (let j = 0; (j < columns.length); (j = (j + 1))) {
  const col = columns[j];
  (result = ((result + row[col]) + " | "));
}
  (result = (result + "\\n"));
}
  return result;
}
export default {parseArgs: parseArgs, getEnv: getEnv, prompt: prompt, spinner: spinner, progressBar: progressBar, colors: colors, table: table};
