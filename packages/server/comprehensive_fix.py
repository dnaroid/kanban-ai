import os
import re

for root, dirs, files in os.walk('src'):
    for file in files:
        if not file.endswith('.ts'):
            continue
            
        file_path = os.path.join(root, file)
        
        # Calculate depth from src/
        rel = os.path.relpath(file_path, 'src')
        depth = rel.count(os.sep) if rel != file else 0
        
        # Correct levels
        levels = depth + 2
        correct_path = '../' * levels + 'shared/src/'
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Replace all variations of relative paths to shared/src/
        new_content = content
        
        # Pattern: from '../any/shared/src/
        for i in range(1, 10):
            old = '../' * i + 'shared/src/'
            if old != correct_path:
                new_content = new_content.replace(f"from '{old}", f"from '{correct_path}")
                new_content = new_content.replace(f'from "{old}', f'from "{correct_path}')
        
        if new_content != content:
            with open(file_path, 'w') as f:
                f.write(new_content)
            print(f"Fixed {file_path} (depth {depth}) → {levels} levels: {correct_path}")

print("\nAll files processed!")
