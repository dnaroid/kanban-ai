import os
import re

def get_relative_path(file_path, target="../../shared/src"):
    """Calculate relative path based on file depth"""
    depth = file_path.count('/') - 2  # -2 for 'src/' prefix
    if depth < 1:
        depth = 1
    return '../' * depth + 'shared/src'

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            file_path = os.path.join(root, file)
            rel_path = get_relative_path(file_path)
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Replace all @shared imports with correct relative paths
            new_content = re.sub(
                r"from ['\"]@shared/([^'\"]+)['\"]",
                f"from '{rel_path}/\\1'",
                content
            )
            new_content = re.sub(
                r'from ["\']@shared/([^"\']+)["\']',
                f'from "{rel_path}/\\1"',
                new_content
            )
            
            # Fix any double slashes
            new_content = new_content.replace('//', '/')
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Fixed: {file_path}")

print("Done!")
