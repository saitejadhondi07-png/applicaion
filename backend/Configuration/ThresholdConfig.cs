namespace Endurance.API.Configuration
{
    public class ThresholdConfig
    {
        public int IdleStepId { get; set; } = 1;
        public int PulseDchStepId { get; set; } = 2;
        public int PulseChStepId { get; set; } = 4;
        public int ShortCdcStepId { get; set; } = 8;

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