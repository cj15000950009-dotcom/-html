with open(r"C:\Users\chenjun\AppData\Roaming\@opensquilla\desktop-electron\opensquilla\workspace\_gh_check\status.txt", encoding="utf-8", errors="replace") as f:
    lines = [l.rstrip("\n") for l in f if l.strip()]

print("TOTAL_LINES:", len(lines))
outside = [l for l in lines if "wuzhenlian\\" not in l and "wuzhenlian/" not in l]
print("OUTSIDE_WUZHENLIAN:")
for l in outside:
    print(" ", l)
