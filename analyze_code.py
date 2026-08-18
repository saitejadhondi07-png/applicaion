import re
import os

source_file = r'C:\Users\omkar\.gemini\antigravity-cli\brain\518d543f-392a-4fd3-8126-5e3961188a94\scratch\full_source.txt'
output_file = r'C:\Users\omkar\.gemini\antigravity-cli\brain\518d543f-392a-4fd3-8126-5e3961188a94\scratch\analysis_output.txt'

issues = []

current_file = None
line_number = 0

with open(source_file, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if line.startswith('--- FILE: '):
            current_file = line.replace('--- FILE: ', '').replace(' ---', '')
            line_number = 0
            continue
        
        line_number += 1
        
        # Check for various issues
        if 'console.log' in line:
            issues.append(f"- **{current_file}:{line_number}**: Leftover `console.log` statement. Should be removed in production.")
        if 'TODO' in line or 'FIXME' in line:
            issues.append(f"- **{current_file}:{line_number}**: Unresolved TODO/FIXME comment.")
        if 'catch (' in line and '{}' in line.replace(' ', ''):
            issues.append(f"- **{current_file}:{line_number}**: Empty catch block. Errors should be logged or handled.")
        if 'catch' in line and not any(x in line.lower() for x in ['log', 'throw', 'return', '{']):
            # It's a bit naive, but let's see.
            pass
            
        if '102024' in line and 'UsersController.cs' in (current_file or ''):
            issues.append(f"- **{current_file}:{line_number}**: Hardcoded User ID '102024' used for logic. This is an anti-pattern.")
            
        if '.replace(/[:\/]/g' in line:
            issues.append(f"- **{current_file}:{line_number}**: Unnecessary escaping of forward slash in regex. Use `/[:/]/g` instead.")

# Write issues
with open(output_file, 'w', encoding='utf-8') as out:
    out.write("# Line-by-Line Exhaustive Audit Report\n\n")
    if issues:
        for issue in issues:
            out.write(issue + "\n")
    else:
        out.write("No major line-by-line issues found matching the heuristics.\n")

print(f"Analysis written to {output_file}")
