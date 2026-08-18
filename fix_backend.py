import os

def replace_in_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix Auth.cs back to having Email in the User class
replace_in_file('backend/Models/Auth.cs', [
    ('public class User\\n    {\\n        public string Id { get; set; } = string.Empty;\\n        public string UserId { get; set; } = string.Empty;', 'public class User\\n    {\\n        public string Id { get; set; } = string.Empty;\\n        public string Email { get; set; } = string.Empty;')
])

# Also put Email back into AuthResponse so it compiles
replace_in_file('backend/Models/Auth.cs', [
    ('public class AuthResponse\\n    {\\n        public string Id { get; set; } = string.Empty;\\n        public string UserId { get; set; } = string.Empty;\\n        public string Email { get; set; } = string.Empty;', 'public class AuthResponse\\n    {\\n        public string Id { get; set; } = string.Empty;\\n        public string Email { get; set; } = string.Empty;')
])

# AuthController.cs
# We want to keep `u.Email == request.UserId` so it checks the UserId against the DB's Email field!
# Wait, the ID field is `u.Id` ! The user logs in with `Id`.
# But previously I changed `u.Email` to `u.Id` in `AuthController.cs`.
# Let's revert it and check `u.Id`.
replace_in_file('backend/Controllers/AuthController.cs', [
    ('u.Id.ToLower() == request.UserId.ToLower()', 'u.Id.ToLower() == request.UserId.ToLower()') # already done
])

# UsersController.cs
# Revert CreateUserRequest UserId back to UserId? Yes, CreateUserRequest is just a DTO, it can have UserId.
# Wait, previously I tried to change `user.Email = request.Email` to `user.Email = request.UserId`.
replace_in_file('backend/Controllers/UsersController.cs', [
    ('Id = request.UserId.Trim(),\\n                Email = request.UserId.Trim(),', 'Id = request.UserId.Trim(),\\n                Email = request.UserId.Trim(),'),
    ('string.IsNullOrEmpty(request.Email)', 'string.IsNullOrEmpty(request.UserId)'),
    ('u.Id.ToLower() == request.UserId.ToLower()', 'u.Id.ToLower() == request.UserId.ToLower()')
])

print('Done')
