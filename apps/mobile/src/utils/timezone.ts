// JS Date.getTimezoneOffset() returns minutes to ADD to local time to reach UTC
// (e.g. Bangkok UTC+7 → -420). This negates that to the conventional "offset from UTC"
// sign (Bangkok → +420), matching the server DTO's documented example.
export function getTimezoneOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
