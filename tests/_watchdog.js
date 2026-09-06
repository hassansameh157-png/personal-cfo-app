// Shared pass/fail detector for this suite's console.log-narrated assertions.
// Required (not copy-pasted) by every script, so a fix here applies to the
// whole suite at once instead of needing 27 identical edits.
//
// The convention throughout this suite is to log "<label>: <expected-true-
// boolean>", so a printed `false` means something didn't match what the
// script expected -- that's the one signal this file automates. It's
// deliberately narrow: an earlier version tried to also treat any printed
// non-empty array as a failure (to catch the `errors.length ? errors :
// "none"` pattern used everywhere for captured page errors), but several
// scripts log a genuinely-expected non-empty array as an informational dump
// (e.g. smoke_batch5.js logging the tag chips actually shown), which that
// broader rule would have flagged as a false failure. Anywhere a script
// needs that errors-array check to actually fail the run, it says so with
// its own explicit boolean line (e.g. `errors.length === 0`) right after
// the informational dump, which this watchdog does catch.
let __anyFailed = false;
const __origConsoleLog = console.log.bind(console);
console.log = (...args) => {
  __origConsoleLog(...args);
  if (args.some((a) => a === false)) __anyFailed = true;
};
process.on("exit", () => {
  if (__anyFailed) process.exitCode = 1;
});
