import os
import re

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            
            # Calculate depth from src/
            rel = os.path.relpath(file_path, 'src')
            depth = rel.count(os.sep)
            levels = depth + 2
            correct = '../' * levels + 'shared/src/'
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Replace ANY path to shared/src/ with correct depth
            # Match: from '../any/number/shared/src/
            new = re.sub(
                r"(from\s+['\"])\.\./+shared/src/",
                f"\\1{correct}",
                content
            )
            
            if new != content:
                with open(file_path, 'w') as f:
                    f.write(new)
                print(f"Fixed {file_path} → {levels} levels")

print("Done!")
