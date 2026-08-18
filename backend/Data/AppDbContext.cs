using Microsoft.EntityFrameworkCore;
using Endurance.API.Models;

namespace Endurance.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<Report> Reports => Set<Report>();
        public DbSet<User> Users => Set<User>();
        public DbSet<ReportFile> ReportFiles => Set<ReportFile>();
        public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            modelBuilder.Entity<Report>()
                .HasKey(r => r.Id);
            modelBuilder.Entity<Report>().Property(r => r.Status).HasMaxLength(50);

            modelBuilder.Entity<ReportFile>().HasKey(rf => rf.Id);
            
            modelBuilder.Entity<RefreshToken>().HasKey(rt => rt.Id);
            modelBuilder.Entity<RefreshToken>().Property(rt => rt.Token).HasMaxLength(200);
            
            // Foreign Keys
            modelBuilder.Entity<Report>()
                .HasOne(r => r.TestEngineerUser)
                .WithMany()
                .HasForeignKey(r => r.TestEngineerId)
                .OnDelete(DeleteBehavior.Restrict);
            
            modelBuilder.Entity<ReportFile>()
                .HasOne(rf => rf.Report)
                .WithMany(r => r.ReportFiles)
                .HasForeignKey(rf => rf.ReportId)
                .OnDelete(DeleteBehavior.Cascade);
            
            modelBuilder.Entity<RefreshToken>()
                .HasIndex(rt => rt.Token)
                .IsUnique();
            
            modelBuilder.Entity<RefreshToken>()
                .HasIndex(rt => rt.UserId);
            
            modelBuilder.Entity<RefreshToken>()
                .HasIndex(rt => rt.ExpiresAt);
            
            modelBuilder.Entity<RefreshToken>()
                .HasOne(rt => rt.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(rt => rt.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            
            modelBuilder.Entity<Report>()
                .HasIndex(r => r.Status);
            
            modelBuilder.Entity<Report>()
                .HasIndex(r => r.TestEngineerId);
            
            modelBuilder.Entity<Report>()
                .HasIndex(r => r.UploadDate);
            
            modelBuilder.Entity<ReportFile>()
                .HasIndex(rf => rf.ReportId);
        }
    }
}
