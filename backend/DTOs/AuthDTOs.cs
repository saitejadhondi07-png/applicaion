using System.ComponentModel.DataAnnotations;

namespace Endurance.API.DTOs
{
    /// <summary>Administrator-issued password reset. See UsersController.ResetPassword.</summary>
    public class ResetPasswordRequestDto
    {
        [Required]
        [StringLength(128, MinimumLength = 12, ErrorMessage = "Password must be at least 12 characters")]
        [DataType(DataType.Password)]
        public string NewPassword { get; set; } = string.Empty;
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
