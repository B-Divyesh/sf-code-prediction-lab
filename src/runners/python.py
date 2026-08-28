import sys

source = sys.stdin.read()
compiled = compile(source, "specimen.py", "exec")

def audit(event, args):
    blocked = ("socket.", "subprocess.", "os.system", "os.spawn", "ctypes.")
    if event == "open" or event.startswith(blocked):
        raise PermissionError(f"operation blocked by the lab: {event}")

sys.addaudithook(audit)

class CappedWriter:
    used = 0
    limit = 16000
    def __init__(self, target): self.target = target
    def write(self, value):
        data = str(value)
        remaining = max(0, self.limit - CappedWriter.used)
        if remaining: self.target.write(data[:remaining])
        CappedWriter.used += len(data.encode("utf-8"))
        if CappedWriter.used > self.limit: raise RuntimeError("Output exceeded the 16 KB limit")
        return len(data)
    def flush(self): self.target.flush()

sys.stdout = CappedWriter(sys.stdout)
sys.stderr = CappedWriter(sys.stderr)
allowed = {
    "print": print, "len": len, "range": range, "enumerate": enumerate,
    "str": str, "int": int, "float": float, "bool": bool, "list": list,
    "dict": dict, "set": set, "tuple": tuple, "sum": sum, "min": min,
    "max": max, "abs": abs, "round": round, "sorted": sorted, "zip": zip,
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError
}
try:
    exec(compiled, {"__builtins__": allowed}, {})
except Exception as exc:
    print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
    sys.exit(1)
