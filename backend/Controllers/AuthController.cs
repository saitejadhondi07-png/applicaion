using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Endurance.API.Data;
using Endurance.API.Models;
using Microsoft.AspNetCore.Authorization;

namespace Endurance.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthController> _logger;
        private readonly IWebHostEnvironment _env;

        public AuthController(AppDbContext context, IConfiguration configuration, ILogger<AuthController> logger, IWebHostEnvironment env)
        {
            _context = context;
            _configuration = configuration;
            _logger = logger;
            _env = env;
        }

        [HttpPost("login")]
        public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
        {
            // Rate limiting is handled by middleware, but we can add additional checks here
            var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            _logger.LogInformation("Login attempt from IP: {ClientIp} for UserId: {UserId}", clientIp, request.UserId);

            var user = await _context.Users
                .Include(u => u.RefreshTokens)
                .FirstOrDefaultAsync(u => u.Id.ToLower() == request.UserId.ToLower());

            if (user == null || string.IsNullOrEmpty(user.Password) || !BCrypt.Net.BCrypt.Verify(request.Password, user.Password))
            {
                _logger.LogWarning("Failed login attempt from IP: {ClientIp} for UserId: {UserId}", clientIp, request.UserId);
                return Unauthorized(new { message = "Invalid User ID or password" });
            }

            if (!user.IsActive)
            {
                _logger.LogWarning("Attempted login by deactivated user UserId: {UserId}", user.Id);
                return Unauthorized(new { message = "Your account has been deactivated." });
            }

            // Generate short-lived access token (15 minutes)
            var accessToken = GenerateAccessToken(user);
            
            // Generate long-lived refresh token (30 days) and store in DB
            var refreshToken = GenerateRefreshToken(user.Id);
            user.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            // Set refresh token in HttpOnly cookie
            SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);

            _logger.LogInformation("Successful login for UserId: {UserId} from IP: {ClientIp}", user.Id, clientIp);

            return Ok(new AuthResponse
            {
                Id = user.Id,
                Email = user.Email,
                Name = user.Name,
                Role = user.Role,
                Avatar = user.Avatar,
                AccessToken = accessToken
            });
        }

        [HttpPost("refresh")]
        public async Task<ActionResult<AuthResponse>> RefreshToken()
        {
            var refreshToken = Request.Cookies["refresh_token"] ?? Request.Headers["X-Refresh-Token"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(refreshToken))
            {
                return Unauthorized(new { message = "Refresh token is required" });
            }

            var storedToken = await _context.RefreshTokens
                .Include(rt => rt.User)
                .FirstOrDefaultAsync(rt => rt.Token == refreshToken && !rt.IsRevoked && rt.ExpiresAt > DateTime.UtcNow);

            if (storedToken == null)
            {
                _logger.LogWarning("Invalid or expired refresh token used");
                return Unauthorized(new { message = "Invalid or expired refresh token" });
            }

            var user = storedToken.User;
            if (user == null || !user.IsActive)
            {
                return Unauthorized(new { message = "Invalid token state or account deactivated" });
            }

            // Rotate refresh token - revoke old, create new
            storedToken.IsRevoked = true;
            storedToken.RevokedAt = DateTime.UtcNow;
            storedToken.ReasonRevoked = "Rotated";

            var newRefreshToken = GenerateRefreshToken(user.Id);
            newRefreshToken.ReplacedByToken = newRefreshToken.Token;
            user.RefreshTokens.Add(newRefreshToken);
            await _context.SaveChangesAsync();

            // Set new refresh token cookie
            SetRefreshTokenCookie(newRefreshToken.Token, newRefreshToken.ExpiresAt);

            var newAccessToken = GenerateAccessToken(user);

            _logger.LogInformation("Token refreshed for UserId: {UserId}", user.Id);

            return Ok(new AuthResponse
            {
                Id = user.Id,
                Email = user.Email,
                Name = user.Name,
                Role = user.Role,
                Avatar = user.Avatar,
                AccessToken = newAccessToken
            });
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var refreshToken = Request.Cookies["refresh_token"] ?? Request.Headers["X-Refresh-Token"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(refreshToken))
            {
                var storedToken = await _context.RefreshTokens
                    .FirstOrDefaultAsync(rt => rt.Token == refreshToken && !rt.IsRevoked);
                
                if (storedToken != null)
                {
                    storedToken.IsRevoked = true;
                    storedToken.RevokedAt = DateTime.UtcNow;
                    storedToken.ReasonRevoked = "User logout";
                    await _context.SaveChangesAsync();
                }
            }

            // Clear the refresh token cookie
            var isDev = _env.IsDevelopment();
            Response.Cookies.Delete("refresh_token", new CookieOptions
            {
                HttpOnly = true,
                Secure = !isDev,
                SameSite = SameSiteMode.Lax,
                Path = "/"
            });

            return Ok(new { message = "Logged out successfully" });
        }

        [HttpPost("revoke-all")]
        [Authorize]
        public async Task<IActionResult> RevokeAllTokens()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized();
            }

            var userTokens = await _context.RefreshTokens
                .Where(rt => rt.UserId == userId && !rt.IsRevoked)
                .ToListAsync();

            foreach (var token in userTokens)
            {
                token.IsRevoked = true;
                token.RevokedAt = DateTime.UtcNow;
                token.ReasonRevoked = "User revoked all sessions";
            }

            await _context.SaveChangesAsync();

            // Clear cookie
            var isDevR = _env.IsDevelopment();
            Response.Cookies.Delete("refresh_token", new CookieOptions
            {
                HttpOnly = true,
                Secure = !isDevR,
                SameSite = SameSiteMode.Lax,
                Path = "/"
            });

            return Ok(new { message = "All sessions revoked" });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<ActionResult> GetCurrentUser()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized();
            }

            var user = await _context.Users
                .Where(u => u.Id == userId)
                .Select(u => new
                {
                    Id = u.Id,
                    Name = u.Name,
                    Role = u.Role.Replace(" ", "_"),
                    Avatar = u.Avatar
                })
                .FirstOrDefaultAsync();

            if (user == null)
            {
                return NotFound();
            }

            return Ok(user);
        }

        private string GenerateAccessToken(User user)
        {
            var jwtKey = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT Secret Key is missing from configuration.");
            var jwtIssuer = _configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("JWT Issuer is missing from configuration.");
            var jwtAudience = _configuration["Jwt:Audience"] ?? throw new InvalidOperationException("JWT Audience is missing from configuration.");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Name, user.Name),
                new Claim(ClaimTypes.Role, user.Role.Replace(" ", "_")),
                new Claim("avatar", user.Avatar),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: jwtIssuer,
                audience: jwtAudience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(15), // Short-lived access token
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpPost("forgot-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.UserId))
            {
                return BadRequest(new { message = "User ID is required." });
            }
            if (string.IsNullOrWhiteSpace(request.NewPassword))
            {
                return BadRequest(new { message = "New Password is required." });
            }

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == request.UserId);
            if (user == null)
            {
                return NotFound(new { message = "User ID not found." });
            }

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password has been successfully reset." });
        }

        private RefreshToken GenerateRefreshToken(string userId)
        {
            var randomBytes = new byte[64];
            using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
            rng.GetBytes(randomBytes);
            var token = Convert.ToBase64String(randomBytes);

            return new RefreshToken
            {
                Id = Guid.NewGuid().ToString(),
                UserId = userId,
                Token = token,
                JwtId = Guid.NewGuid().ToString(),
                ExpiresAt = DateTime.UtcNow.AddDays(30),
                CreatedAt = DateTime.UtcNow
            };
        }

        private void SetRefreshTokenCookie(string token, DateTime expiresAt)
        {
            var isDev = _env.IsDevelopment();
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = !isDev,
                SameSite = SameSiteMode.Lax,
                Expires = expiresAt,
                Path = "/",
                IsEssential = true
            };
            Response.Cookies.Append("refresh_token", token, cookieOptions);
        }
    }

    public class ForgotPasswordRequest
    {
        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.StringLength(20, MinimumLength = 4)]
        public string UserId { get; set; } = string.Empty;

        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.StringLength(128, MinimumLength = 8)]
        public string NewPassword { get; set; } = string.Empty;
    }
}