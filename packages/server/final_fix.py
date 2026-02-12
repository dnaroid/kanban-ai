import os
import re

def get_depth(file_path):
    """Calculate depth from src/ directory"""
    rel = os.path.relpath(file_path, 'src')
    return rel.count(os.sep)

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            depth = get_depth(file_path)
            
            # Correct levels: depth + 2
            levels = depth + 2
            correct_path = '../' * levels + 'shared/src/'
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Replace ANY relative path to shared/src/ with correct depth
            new_content = re.sub(
                r"from ['\"]\.\./+shared/src/",
                f"from '{correct_path}",
                content
            )
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed {file_path} (depth {depth}) → {levels} levels")

print("All files fixed!")
