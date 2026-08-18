using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.ResponseCompression;
using System.Text;
using System.Text.Json;
using BCrypt.Net;
using Endurance.API.Configuration;
using Endurance.API.Data;
using Endurance.API.Models;
using AspNetCoreRateLimit;
using Serilog;
using System.Security.Claims;
using System.IO.Compression;

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File("logs/app-.txt", rollingInterval: RollingInterval.Day, restrictedToMinimumLevel: Serilog.Events.LogEventLevel.Information)
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog();

    // Security: Require HTTPS in production
    if (!builder.Environment.IsDevelopment())
    {
        builder.Services.AddHttpsRedirection(options =>
        {
            options.HttpsPort = 443;
        });
    }

    // JWT Configuration - no fallback, must be in config
    var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT Secret Key is missing from configuration.");
    var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("JWT Issuer is missing from configuration.");
    var jwtAudience = builder.Configuration["Jwt:Audience"] ?? throw new InvalidOperationException("JWT Audience is missing from configuration.");

    // Configure Kestrel Server limits for large file uploads (up to 1GB)
    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Limits.MaxRequestBodySize = 1024L * 1024L * 1024L; // 1 GB
        options.Limits.MaxRequestBufferSize = 1024 * 1024; // 1 MB buffer
        options.Limits.MaxResponseBufferSize = 1024 * 1024;
        
        if (!builder.Environment.IsDevelopment())
        {
            options.ConfigureHttpsDefaults(httpsOptions =>
            {
                httpsOptions.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
            });
        }
    });

    // Configure Form limits for large file uploads (up to 1GB)
    builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
    {
        options.MultipartBodyLengthLimit = 1024L * 1024L * 1024L; // 1 GB
        options.ValueLengthLimit = int.MaxValue;
        options.MultipartHeadersLengthLimit = 1024 * 1024 * 1024;
    });

    // Configure IIS Server limits for large file uploads (up to 1GB) when hosted under IIS
    builder.Services.Configure<IISServerOptions>(options =>
    {
        options.MaxRequestBodySize = 1024L * 1024L * 1024L; // 1 GB
    });

    // Response Compression
    builder.Services.AddResponseCompression(options =>
    {
        options.EnableForHttps = true;
        options.Providers.Add<BrotliCompressionProvider>();
        options.Providers.Add<GzipCompressionProvider>();
        options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[] { "application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    });
    builder.Services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
    builder.Services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);

    // Read connection string from configuration (appsettings.json)
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    Log.Information("Hosting Environment: {Environment}", builder.Environment.EnvironmentName);
    // SECURITY: Never log connection string - it may contain credentials
    Log.Information("Database Connection String: [REDACTED]");

    // Add DbContext configuring SQL Server database from appsettings.json
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlServer(connectionString, sqlOptions => sqlOptions.CommandTimeout(300)));

    // Add JWT Authentication
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                ClockSkew = TimeSpan.Zero
            };
        });

    builder.Services.AddAuthorization();

    // Enable CORS
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowSpecificOrigins", policy =>
        {
            policy.SetIsOriginAllowed(origin => true)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        });
    });

    builder.Services.AddControllers();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddHealthChecks();

// Register Services
    builder.Services.Configure<Endurance.API.Configuration.ThresholdConfig>(builder.Configuration.GetSection("Thresholds"));
    builder.Services.AddScoped<Endurance.API.Services.ReportCalculator>();
    builder.Services.AddScoped<Endurance.API.Services.IReportService, Endurance.API.Services.ReportService>();

    // Rate Limiting Configuration
    builder.Services.AddMemoryCache();
    builder.Services.Configure<IpRateLimitOptions>(builder.Configuration.GetSection("IpRateLimiting"));
    builder.Services.AddInMemoryRateLimiting();
    builder.Services.AddSingleton<IRateLimitConfiguration, RateLimitConfiguration>();

    // Antiforgery for CSRF protection
    builder.Services.AddAntiforgery(options =>
    {
        options.HeaderName = "X-CSRF-TOKEN";
        options.Cookie.Name = "XSRF-TOKEN";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.None : CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });

    // Note: Response compression is already configured above (lines 73-81)

    var app = builder.Build();

    // Security Headers Middleware
    app.Use(async (context, next) =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"] = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()";
        
        // CSP - restrictive but allows inline scripts for React dev
        if (app.Environment.IsDevelopment())
        {
            context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none';";
        }
        else
        {
            context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';";
            context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
        }
        
        await next();
    });

    // ProblemDetails (RFC 7807) for consistent error responses
    app.UseExceptionHandler("/error");
    app.Map("/error", (HttpContext context) =>
    {
        var exception = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
        var env = context.RequestServices.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        var problemDetails = new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = context.Response.StatusCode,
            Title = "An error occurred",
            Detail = env.IsDevelopment() ? exception?.Message : "An unexpected error occurred. Please try again.",
            Instance = context.Request.Path
        };
        
        if (env.IsDevelopment())
        {
            problemDetails.Extensions["traceId"] = context.TraceIdentifier;
            problemDetails.Extensions["stackTrace"] = exception?.StackTrace;
        }

        context.Response.ContentType = "application/problem+json";
        return Results.Problem(problemDetails);
    });

    // Enable Response Compression
    app.UseResponseCompression();

    // Enable Rate Limiting Middleware
    app.UseIpRateLimiting();

    // Enable CORS
    app.UseCors("AllowSpecificOrigins");

    // Security: Https redirection is handled by IIS in production, so we do not enforce it here to avoid certificate errors when testing the standalone build.

    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapHealthChecks("/health");



    // Initialize database and seed initial data
    using (var scope = app.Services.CreateScope())
    {
        // Ensure physical storage and logs directories exist for IIS hosting (even if DB is temporarily unreachable)
        try
        {
            string rawDir = Path.Combine(AppContext.BaseDirectory, "Storage", "RawFiles");
            if (!Directory.Exists(rawDir)) Directory.CreateDirectory(rawDir);

            string logsDir = Path.Combine(AppContext.BaseDirectory, "logs");
            if (!Directory.Exists(logsDir)) Directory.CreateDirectory(logsDir);
        }
        catch { }

        try
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            try 
            {
                db.Database.Migrate();
            }
            catch (Exception ex)
            {
                Log.Warning("Could not apply migrations automatically (tables may already exist). Skipping. Details: " + ex.Message);
            }
            
            if (!db.Users.Any())
            {
                Log.Information("Database is empty - seeding default admin user.");
                var adminPassword = builder.Configuration["DefaultAdminPassword"]
                    ?? Environment.GetEnvironmentVariable("DEFAULT_ADMIN_PASSWORD")
                    ?? "AdminPass123!";
                db.Users.Add(new User
                {
                    Id = "102024",
                    Name = "System Admin",
                    Email = "admin@mendewadi.com",
                    Password = BCrypt.Net.BCrypt.HashPassword(adminPassword),
                    Role = "admin",
                    Avatar = "https://ui-avatars.com/api/?name=System+Admin&background=0D8ABC&color=fff"
                });
                Log.Warning("Default admin user created. PLEASE CHANGE THE PASSWORD IMMEDIATELY.");
            }
            else
            {
                var admin = await db.Users.FirstOrDefaultAsync(u => u.Id == "102024").ConfigureAwait(false);
                // Removed the code that forcibly resets the admin password on every boot,
                // so that user-edited passwords are preserved.
            }

            // Reports are not seeded for a clean initial state
            await db.SaveChangesAsync().ConfigureAwait(false);
        }
        catch (Exception dbEx)
        {
            Log.Error(dbEx, "Could not connect to or initialize SQL Server during startup!");
            Log.Error("Connection String: [REDACTED]");
            Log.Error("Please update 'appsettings.json' and 'appsettings.Production.json' with your exact SQL Server instance.");
            throw;
        }
    }
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application start-up failed");
}
finally
{
    Log.CloseAndFlush();
}