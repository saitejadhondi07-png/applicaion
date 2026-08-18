using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using BCrypt.Net;
using Endurance.API.Data;
using Endurance.API.Models;
using Endurance.API.DTOs;

namespace Endurance.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "admin")]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserResponseDto>>> GetUsers()
        {
            var list = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive)
                .OrderBy(u => u.Name)
                .Select(u => new UserResponseDto
                {
                    Id = u.Id,
                    Email = u.Email,
                    Name = u.Name,
                    Role = u.Role.Replace(" ", "_"),
                    Avatar = u.Avatar
                })
                .ToListAsync();
            return Ok(list);
        }

        [HttpPost]
        public async Task<ActionResult<UserResponseDto>> CreateUser([FromBody] CreateUserRequestDto request)
        {
            // Check if user ID already exists
            bool exists = await _context.Users.AnyAsync(u => u.Id.ToLower() == request.UserId.ToLower());
            if (exists)
            {
                return BadRequest(new { message = "A user with this User ID already exists" });
            }

            // Generate initials for avatar
            string initials = "";
            var parts = request.Name.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length > 0)
            {
                initials += parts[0][0];
                if (parts.Length > 1)
                {
                    initials += parts[1][0];
                }
            }
            if (initials.Length == 0) initials = "U";
            initials = initials.ToUpper();

            var user = new User
            {
                Id = request.UserId.Trim(),
                Email = request.UserId.Trim(),
                Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Name = request.Name.Trim(),
                Role = request.Role.ToLower().Trim().Replace(" ", "_"),
                Avatar = initials
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(new UserResponseDto
            {
                Id = user.Id,
                Email = user.Email,
                Name = user.Name,
                Role = user.Role,
                Avatar = user.Avatar
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(string id)
        {
            // SECURITY: Validate id parameter
            if (string.IsNullOrWhiteSpace(id) || id.Contains("..") || id.Contains("/") || id.Contains("\\"))
            {
                return BadRequest(new { message = "Invalid user ID" });
            }

            var user = await _context.Users.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            // Prevent deleting the last admin to ensure at least one admin always exists
            if (user.Role.Equals("admin", StringComparison.OrdinalIgnoreCase))
            {
                var adminCount = await _context.Users.CountAsync(u => u.Role == "admin");
                if (adminCount <= 1)
                {
                    return BadRequest(new { message = "Cannot delete the last administrator account" });
                }
            }

            try
            {
                user.IsActive = false;
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "An error occurred while deactivating the user: " + ex.Message });
            }

            return NoContent();
        }
    }
}
