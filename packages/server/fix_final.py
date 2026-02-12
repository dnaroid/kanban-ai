import os
import re

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            
            # Calculate depth from packages/server/src/
            rel_path = os.path.relpath(file_path, 'src')
            depth = rel_path.count(os.sep)
            
            # Need to exit packages/server/ too, so +1 level
            if depth == 0:
                rel_import = '../../shared/src'  # Exit src and server
            else:
                rel_import = '../' * (depth + 2) + 'shared/src'  # +2 for src/ and server/
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Fix all relative paths to shared
            new_content = re.sub(
                r"from ['\"]\.\./+shared/src/",
                f"from '{rel_import}/",
                content
            )
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed: {file_path}")

print("Done!")
