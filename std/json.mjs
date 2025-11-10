const print = console.log;
function parse(jsonString) {
  try {
  return JSON.parse(jsonString);
} catch (e) {
  throw ("Invalid JSON: " + e.message);
}
}
function stringify(value) {
  return JSON.stringify(value);
}
function stringifyPretty(value) {
  return JSON.stringify(value, null, 2);
}
function validate(jsonString) {
  try {
  JSON.parse(jsonString);
  return true;
} catch (e) {
  return false;
}
}
export default {parse: parse, stringify: stringify, stringifyPretty: stringifyPretty, validate: validate};
