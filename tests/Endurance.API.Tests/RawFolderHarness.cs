using System.Collections.Concurrent;
using Endurance.API.Configuration;
using Endurance.API.Models;
using Endurance.API.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace Endurance.API.Tests;

/// <summary>
/// Diagnostic harness. Replays a real folder of plant exports through the exact parse+merge
/// path ReportService uses - same parallelism, same ConcurrentBag, same merge - and checks
/// two things the Summary Report depends on:
///   1. every record's pack ID is the one in its own filename;
///   2. repeated runs over identical input produce byte-identical output.
///
/// Opt-in: set RAW_FOLDER (and optionally RAW_RUNS, RAW_OUT). Skips silently otherwise so it
/// never breaks a normal test run.
/// </summary>
public class RawFolderHarness
{
    private static readonly SemaphoreSlim ExcelSlots =
        new(Math.Max(1, Math.Min(Environment.ProcessorCount, 3)));

    [Fact]
    public void Replay()
    {
        var folder = Environment.GetEnvironmentVariable("RAW_FOLDER");
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return;

        int runs = int.TryParse(Environment.GetEnvironmentVariable("RAW_RUNS"), out var n) ? n : 1;
        var outPath = Environment.GetEnvironmentVariable("RAW_OUT") ?? Path.Combine(Path.GetTempPath(), "raw_harness.txt");

        var calc = new ReportCalculator(Options.Create(new ThresholdConfig()));
        var files = Directory.GetFiles(folder, "*", SearchOption.AllDirectories)
                             .Where(f => { var e = Path.GetExtension(f).ToLowerInvariant(); return e == ".csv" || e == ".xlsx"; })
                             .OrderBy(f => f, StringComparer.Ordinal)
                             .ToArray();

        var log = new List<string> { $"folder : {folder}", $"files  : {files.Length}", $"runs   : {runs}" };
        List<string>? baseline = null;

        for (int run = 0; run < runs; run++)
        {
            var bag = new ConcurrentBag<PackRecord>();
            var failed = new ConcurrentBag<string>();

            Parallel.ForEach(files.Select((f, i) => (path: f, order: i)), item =>
            {
                var name = Path.GetFileName(item.path);
                try
                {
                    var parsed = new List<PackRecord>();
                    if (Path.GetExtension(name).ToLowerInvariant() == ".xlsx")
                    {
                        // Mirrors ReportService: one open per workbook, and the same cap on how
                        // many are alive at once, so a measurement here means something on the
                        // server.
                        ExcelSlots.Wait();
                        try { parsed.AddRange(calc.ProcessExcelFile(item.path, name)); }
                        finally { ExcelSlots.Release(); }
                    }
                    else parsed.Add(calc.ProcessRawCsv(item.path, name));

                    foreach (var rec in parsed) { rec.UploadOrder = item.order; bag.Add(rec); }
                }
                catch (Exception ex) { failed.Add($"{name} :: {ex.Message}"); }
            });

            var merged = ReportService.MergeByPack(bag);

            // Signature of the whole report: order matters, every printed value included.
            var signature = merged.Select(r => string.Join("|",
                r.BatteryPackId, r.IdleDeltaV, r.IdleDeltaT, r.DchDeltaV, r.DchDeltaT,
                r.ChDeltaV, r.ChDeltaT, r.ShortChDeltaV, r.ShortDchDeltaV,
                r.Soc, r.Voltage, r.BmsError, r.PulseResult, r.CdcResult, r.SocResult,
                r.OverallResult, r.SourceFile)).ToList();

            if (baseline == null)
            {
                baseline = signature;
                log.Add($"run {run}: packs={merged.Count} rejected={failed.Count} (baseline)");

                // Full dump, so a refactor of the parsers can be diffed value-by-value against
                // the output they produced before it.
                File.WriteAllLines(outPath + ".signature.txt", signature);

                foreach (var f in failed.OrderBy(x => x)) log.Add($"   REJECTED {f}");

                // Does each row's ID come from its own file?
                foreach (var rec in merged)
                {
                    var fromName = calc.ExtractBatteryPackId(rec.SourceFile.Split(',')[0].Trim());
                    if (fromName != rec.BatteryPackId)
                        log.Add($"   ID-MISMATCH report={rec.BatteryPackId} filename={fromName} src={rec.SourceFile}");
                }
            }
            else
            {
                int diffs = 0;
                if (signature.Count != baseline.Count)
                    log.Add($"   NONDETERMINISM run {run}: pack count {signature.Count} vs baseline {baseline.Count}");
                for (int i = 0; i < Math.Min(signature.Count, baseline.Count); i++)
                    if (signature[i] != baseline[i])
                    {
                        if (diffs < 10) log.Add($"   NONDETERMINISM run {run} row {i}:\n      base={baseline[i]}\n      now ={signature[i]}");
                        diffs++;
                    }
                log.Add($"run {run}: packs={merged.Count} rejected={failed.Count} diffs-vs-baseline={diffs}");
            }
        }

        File.WriteAllLines(outPath, log);
    }
}
