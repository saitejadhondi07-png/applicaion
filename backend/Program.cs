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

    // Warn (never throw) if the signing key is still a shipped placeholder or too short to be
    // safe. Anyone who knows the key can mint valid tokens for any user and role.
    // This is intentionally non-fatal so an existing deployment can never fail to start;
    // set Jwt__Key as an environment variable, or edit appsettings.json, to silence it.
    if (jwtKey.Contains("CHANGE_THIS", StringComparison.OrdinalIgnoreCase) || jwtKey.Length < 32)
    {
        Log.Warning("SECURITY: Jwt:Key is a placeholder or shorter than 32 chars. Tokens are forgeable.");
        Log.Warning("SECURITY: Set a unique 64-char random key via the Jwt__Key environment variable or appsettings.json.");
    }

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
    // The frontend is served from the same machine as the API but on a different port
    // (IIS :80 -> API :5191), and the deployment hostname/IP is not known at build time
    // (see src/config.js). So allow any origin whose host matches the host the request
    // actually arrived on, plus anything explicitly listed in AllowedOrigins.
    // This keeps every existing deployment working on any IP, while stopping arbitrary
    // third-party sites from making credentialed calls with the refresh_token cookie.
    var httpContextAccessor = new HttpContextAccessor();
    builder.Services.AddSingleton<IHttpContextAccessor>(httpContextAccessor);
    var configuredOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowSpecificOrigins", policy =>
        {
            policy.SetIsOriginAllowed(origin =>
                  {
                      if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
                      if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri)) return false;

                      var requestHost = httpContextAccessor.HttpContext?.Request.Host.Host;
                      return requestHost != null
                          && string.Equals(originUri.Host, requestHost, StringComparison.OrdinalIgnoreCase);
                  })
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

    // CSRF note: no antiforgery middleware is registered, and none is needed.
    // The API authenticates with a Bearer token in the Authorization header, which a
    // cross-site request cannot set, and the only cookie (refresh_token) is SameSite=Lax
    // so it is not sent on cross-site POSTs to /api/auth/refresh.
    // A previous AddAntiforgery(...) block was removed here: UseAntiforgery() was never
    // called and no action carried [ValidateAntiForgeryToken], so it protected nothing.

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
            // Raw upload storage is created by ReportService at the configured path
            // (Storage:RawFilesPath). A "Storage/RawFiles" folder used to be created here that
            // no code ever read from or wrote to.
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
                // Migrate() stops at the first migration that throws, so everything after it is
                // skipped too. On a database that predates migration tracking, migration #1 fails
                // with "There is already an object named 'Users'" and every later migration is
                // silently dropped - the app then starts against a schema the code does not match
                // and returns 500 on every query touching the missing column.
                // Logged as an error, and the still-pending migrations are named, because this
                // used to be a warning that nobody saw until the UI broke.
                Log.Error(ex, "SCHEMA: migrations could not be applied. The database may not match this build.");

                try
                {
                    var pending = db.Database.GetPendingMigrations().ToList();
                    if (pending.Count > 0)
                    {
                        Log.Error("SCHEMA: {Count} migration(s) NOT applied: {Pending}",
                            pending.Count, string.Join(", ", pending));
                        Log.Error("SCHEMA: if the tables already exist, baseline them by inserting the " +
                                  "already-applied MigrationIds into __EFMigrationsHistory, then restart.");
                    }
                }
                catch (Exception probeEx)
                {
                    Log.Error(probeEx, "SCHEMA: could not determine which migrations are pending.");
                }
            }
            
            if (!db.Users.Any())
            {
                Log.Information("Database is empty - seeding default admin user.");
                var configuredAdminPassword = builder.Configuration["DefaultAdminPassword"]
                    ?? Environment.GetEnvironmentVariable("DEFAULT_ADMIN_PASSWORD");

                // No hardcoded default: if none is configured, generate one and print it once.
                // Only reachable on a brand-new database, so existing deployments are unaffected.
                var adminPassword = configuredAdminPassword
                    ?? Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(18)) + "!aA1";

                if (configuredAdminPassword == null)
                {
                    Log.Warning("No DefaultAdminPassword configured. Generated a one-time admin password: {Password}", adminPassword);
                    Log.Warning("Copy it now - it is not stored anywhere else and will not be shown again.");
                }
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
            // Existing databases are left alone: the admin password is never reset on boot,
            // so user-edited passwords are preserved.

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