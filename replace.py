import os

def replace_in_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# 1. LoginPage.jsx
replace_in_file('src/pages/LoginPage.jsx', [
    ('const [email, setEmail]', 'const [userId, setUserId]'),
    ('!email.trim()', '!userId.trim()'),
    ('both email and', 'both User ID and'),
    ('login(email, password)', 'login(userId, password)'),
    ('Invalid email or password', 'Invalid User ID or password'),
    ('htmlFor="login-email">Email Address', 'htmlFor="login-userid">User ID'),
    ('id="login-email"', 'id="login-userid"'),
    ('type="email"', 'type="text"'),
    ('e.g. admin@endurance.com', 'e.g. usr-001'),
    ('value={email}', 'value={userId}'),
    ('setEmail(e.target.value)', 'setUserId(e.target.value)')
])

# 2. UsersPage.jsx
replace_in_file('src/pages/UsersPage.jsx', [
    ('const [email, setEmail]', 'const [userId, setUserId]'),
    ('!email.trim()', '!userId.trim()'),
    ('JSON.stringify({ name, email, password, role })', 'JSON.stringify({ userId, name, password, role })'),
    ("setEmail('')", "setUserId('')"),
    ('handleDeleteUser(u.id, u.email, u.name)', 'handleDeleteUser(u.id, u.name)'),
    ('handleDeleteUser = async (id, userEmail, userName)', 'handleDeleteUser = async (id, userName)'),
    ("userEmail.toLowerCase() === 'admin@endurance.com'", "id === 'usr-001'"),
    ('htmlFor="user-email">Email Address', 'htmlFor="user-userid">User ID'),
    ('id="user-email"', 'id="user-userid"'),
    ('type="email"', 'type="text"'),
    ('e.g. john@endurance.com', 'e.g. EMP123'),
    ('value={email}', 'value={userId}'),
    ('setEmail(e.target.value)', 'setUserId(e.target.value)'),
    ('u.email === currentUser?.email', 'u.id === currentUser?.id'),
    ('{u.email}', '{u.id}'),
    ("disabled={u.email.toLowerCase() === 'admin@endurance.com'}", "disabled={u.id === 'usr-001'}"),
    ('className="user-email-text"', 'className="user-userid-text"')
])

# 3. AuthContext.jsx
replace_in_file('src/contexts/AuthContext.jsx', [
    ('login = useCallback(async (email, password)', 'login = useCallback(async (userId, password)'),
    ('JSON.stringify({ email, password })', 'JSON.stringify({ userId, password })'),
    ('Invalid email or password', 'Invalid User ID or password'),
    ("email: rawUser.email || rawUser.Email || ''", "userId: rawUser.id || rawUser.Id || '', email: ''")
])

# 4. Auth.cs
replace_in_file('backend/Models/Auth.cs', [
    ('public string Email { get; set; } = string.Empty;', 'public string UserId { get; set; } = string.Empty;'),
    ('public string Id { get; set; } = string.Empty;\\n        public string Email', 'public string Id { get; set; } = string.Empty;\\n        public string UserId { get; set; } = string.Empty;\\n        public string Email')
])

# 5. AuthController.cs
replace_in_file('backend/Controllers/AuthController.cs', [
    ('u.Email.ToLower() == request.Email.ToLower()', 'u.Id.ToLower() == request.UserId.ToLower()'),
    ('Invalid email or password', 'Invalid User ID or password')
])

# 6. UsersController.cs
replace_in_file('backend/Controllers/UsersController.cs', [
    ('public string Email { get; set; } = string.Empty;', 'public string UserId { get; set; } = string.Empty;'),
    ('string.IsNullOrEmpty(request.Email)', 'string.IsNullOrEmpty(request.UserId)'),
    ('Email, Password, Name, Role', 'UserId, Password, Name, Role'),
    ('u.Email.ToLower() == request.Email.ToLower()', 'u.Id.ToLower() == request.UserId.ToLower()'),
    ('email address already exists', 'User ID already exists'),
    ('Id = $"usr-{DateTime.UtcNow.Ticks}",\\n                Email = request.Email.Trim(),', 'Id = request.UserId.Trim(),\\n                Email = request.UserId.Trim(),'),
    ('user.Email.Equals("admin@endurance.com"', 'user.Id.Equals("usr-001"')
])

print('Done')
