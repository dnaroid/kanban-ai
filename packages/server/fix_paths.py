import os
import re

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            
            # Calculate depth from src/ directory
            rel_path = os.path.relpath(file_path, 'src')
            depth = rel_path.count(os.sep)  # Count directories
            
            # Generate correct relative path
            if depth == 0:
                rel_import = '../shared/src'
            else:
                rel_import = '../' * (depth + 1) + 'shared/src'
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Fix all relative paths to shared
            # Pattern: any number of ../ followed by shared/src
            new_content = re.sub(
                r"from ['\"]\.\./+(shared/src/[^'\"]+)['\"]",
                f"from '{rel_import}/\\1'",
                content
            )
            new_content = re.sub(
                r'from ["\']\.\./+(shared/src/[^"\']+)["\']',
                f'from "{rel_import}/\\1"',
                new_content
            )
            
            # Fix damaged comments
            new_content = re.sub(r'^(\s*)/ ([A-Za-z])', r'\1// \2', new_content, flags=re.MULTILINE)
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed: {file_path}")

print("Done!")
