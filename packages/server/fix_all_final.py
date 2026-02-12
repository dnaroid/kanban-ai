import os
import re

def get_relative_path(file_path):
    """Calculate correct relative path to packages/shared/src/"""
    # Get relative path from src/
    rel_path = os.path.relpath(file_path, 'src')
    
    # Count depth (number of directories)
    depth = rel_path.count(os.sep)
    
    # Need depth+2 levels to exit src/ and server/ and reach packages/shared/
    if depth == 0:
        return '../../shared/src'  # src/file.ts → packages/shared/src
    else:
        return '../' * (depth + 2) + 'shared/src'

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            rel_import = get_relative_path(file_path)
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Replace any number of ../ followed by shared/src/
            new_content = re.sub(
                r"from ['\"]\.\./+shared/src/",
                f"from '{rel_import}/",
                content
            )
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed: {file_path} → {rel_import}")

print("Done! All files fixed with correct depth.")
