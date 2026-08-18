using System.ComponentModel.DataAnnotations;

namespace Endurance.API.DTOs
{
    public class LoginRequestDto
    {
        [Required]
        [RegularExpression(@"^\d+$", ErrorMessage = "User ID must be numeric")]
        [StringLength(20, MinimumLength = 4, ErrorMessage = "User ID must be between 4 and 20 digits")]
        public string UserId { get; set; } = string.Empty;

        [Required]
        [StringLength(128, MinimumLength = 12, ErrorMessage = "Password must be at least 12 characters")]
        [DataType(DataType.Password)]
        public string Password { get; set; } = string.Empty;
    }

    public class AuthResponseDto
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public string AccessToken { get; set; } = string.Empty;
    }

    public class RefreshTokenRequestDto
    {
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class CreateUserRequestDto
    {
        [Required]
        [RegularExpression(@"^\d+$", ErrorMessage = "User ID must be numeric")]
        [StringLength(20, MinimumLength = 4)]
        public string UserId { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [StringLength(128, MinimumLength = 12)]
        [DataType(DataType.Password)]
        public string Password { get; set; } = string.Empty;

        [Required]
        [RegularExpression("^(admin|test_engineer|quality_engineer|quality_manager)$", ErrorMessage = "Invalid role")]
        public string Role { get; set; } = string.Empty;
    }

    public class UserResponseDto
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
    }
}
