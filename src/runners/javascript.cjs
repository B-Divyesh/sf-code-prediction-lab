const vm = require("node:vm");
let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => source += chunk);
process.stdin.on("end", () => {
  const limit = 16000;
  let written = 0;
  const write = (stream, value) => {
    const data = Buffer.from(value);
    const remaining = Math.max(0, limit - written);
    if (remaining) stream.write(data.subarray(0, remaining));
    written += data.length;
    if (written > limit) throw new Error("Output exceeded the 16 KB limit");
  };
  const clean = value => {
    try { return typeof value === "string" ? value : JSON.stringify(value); }
    catch { return String(value); }
  };
  const safeConsole = Object.freeze({
    log: (...values) => write(process.stdout, values.map(clean).join(" ") + "\n"),
    error: (...values) => write(process.stderr, values.map(clean).join(" ") + "\n"),
    warn: (...values) => write(process.stderr, values.map(clean).join(" ") + "\n")
  });
  const context = vm.createContext({ console: safeConsole }, {
    name: "specimen",
    codeGeneration: { strings: false, wasm: false }
  });
  try { new vm.Script(source, { filename: "specimen.js" }).runInContext(context, { timeout: 1500, breakOnSigint: true }); }
  catch (error) { process.stderr.write(`${error.name}: ${error.message}\n`); process.exitCode = 1; }
});
