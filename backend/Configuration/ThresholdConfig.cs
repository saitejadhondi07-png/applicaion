namespace Endurance.API.Configuration
{
    public class ThresholdConfig
    {
        // NOTE: there are deliberately no Step ID settings here. ReportCalculator selects rows
        // by the Step State text in the export ("REST"/"IDLE", "CC DISCHARGE", "CC CHARGE",
        // "BMS FOLLOW"), not by Step ID. Four IdleStepId/PulseDchStepId/PulseChStepId/
        // ShortCdcStepId keys used to sit here and were read by nothing, so tuning them
        // appeared to work and changed no behaviour.

        public int DchDeltaVHold { get; set; } = 11;
        public int ChDeltaVHold { get; set; } = 9;
        public int ShortChDeltaVFail { get; set; } = 9;
        public int ShortDchDeltaVFail { get; set; } = 10;
        public int IdleDeltaVHold { get; set; } = 5;
        public double IdleDeltaTHold { get; set; } = 2.0;
        public double DchDeltaTHold { get; set; } = 2.0;
        public double ChDeltaTHold { get; set; } = 2.0;
        public double SocMin { get; set; } = 24.0;
        public double SocMax { get; set; } = 30.0;
    }
}