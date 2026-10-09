namespace Endurance.API.Models
{
    public class LoginRequest
    {
        // [ApiController] only returns 400 for a malformed body when the model carries
        // validation attributes. Without these, an omitted userId reached
        // request.UserId.ToLower() and the login endpoint answered 500.
        // Deliberately no minimum password length: this is the sign-in path, and enforcing
        // today's policy here would lock out every account created under an older one.
        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.StringLength(20, MinimumLength = 1)]
        public string UserId { get; set; } = string.Empty;

        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.StringLength(128, MinimumLength = 1)]
        public string Password { get; set; } = string.Empty;
    }

    public class ForgotPasswordRequestDto
    {
        [System.ComponentModel.DataAnnotations.Required]
        public string UserId { get; set; } = string.Empty;

        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.MinLength(6, ErrorMessage = "Password must be at least 6 characters long.")]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class AuthResponse
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class RefreshToken
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string UserId { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string JwtId { get; set; } = string.Empty;
        public bool IsRevoked { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(30);
        public DateTime? RevokedAt { get; set; }
        public string ReplacedByToken { get; set; } = string.Empty;
        public string ReasonRevoked { get; set; } = string.Empty;
        
        // Navigation property
        public User? User { get; set; }
    }

    public class User
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public List<RefreshToken> RefreshTokens { get; set; } = new();
    }
}
