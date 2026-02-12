import os
import re

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            
            # Calculate depth from src/
            rel_path = os.path.relpath(file_path, 'src')
            depth = rel_path.count(os.sep)
            
            # Correct formula: depth + 2 levels
            # depth 0 → 2 levels (../../)
            # depth 1 → 3 levels (../../../)
            # depth 2 → 4 levels (../../../../)
            levels = depth + 2
            correct_path = '../' * levels + 'shared/src/'
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Replace ANY existing relative path to shared/src/
            new_content = re.sub(
                r"from ['\"]\.\./+shared/src/",
                f"from '{correct_path}",
                content
            )
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed {file_path} (depth {depth}) → {correct_path}")

print("Done!")
