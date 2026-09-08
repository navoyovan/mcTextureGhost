using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using McTextureGhost.Models;
using McTextureGhost.Views;

namespace McTextureGhost.Services;

/// <summary>
/// Target interface for visual elements that render animated flipbook frames.
/// </summary>
public interface IFlipbookTarget
{
    void UpdateFrame(BitmapSource frame);
    void UpdateBlendedFrame(BitmapSource frameA, BitmapSource frameB, double progress);
}

/// <summary>
/// Centralized frame coordinator for Minecraft Bedrock flipbook animated textures.
/// Synchronizes animations to a continuous 20Hz (50ms) global world tick clock,
/// pre-slices sprite sheet frames with zero-copy CroppedBitmap views, supports full
/// custom frame sequences and seamless crossfade blending, and pauses when zero items are visible.
/// </summary>
public static class FlipbookAnimationManager
{
    public sealed class CachedFrames
    {
        public BitmapSource[] Frames { get; }
        public int FrameWidth { get; }
        public int FrameCount => Frames.Length;

        public CachedFrames(BitmapSource[] frames, int frameWidth)
        {
            Frames = frames;
            FrameWidth = frameWidth;
        }
    }

    private sealed class Registration
    {
        public IFlipbookTarget Target { get; }
        public string FullPath { get; }
        public FlipbookDefinition Definition { get; }
        public CachedFrames Frames { get; }
        public int[] Sequence { get; }
        public int TicksPerFrame { get; }
        public bool BlendFrames { get; }
        public int LastFrameIndex { get; set; } = -1;

        public Registration(IFlipbookTarget target, string fullPath, FlipbookDefinition definition, CachedFrames frames)
        {
            Target = target;
            FullPath = fullPath;
            Definition = definition;
            Frames = frames;
            TicksPerFrame = Math.Max(1, definition.TicksPerFrame);
            BlendFrames = definition.BlendFrames;

            // Sanitize custom frame sequence
            if (definition.Frames != null && definition.Frames.Length > 0)
            {
                var seq = new int[definition.Frames.Length];
                for (int i = 0; i < definition.Frames.Length; i++)
                {
                    int f = definition.Frames[i];
                    seq[i] = (f >= 0 && f < frames.FrameCount) ? f : 0;
                }
                Sequence = seq;
            }
            else
            {
                var seq = new int[frames.FrameCount];
                for (int i = 0; i < frames.FrameCount; i++) seq[i] = i;
                Sequence = seq;
            }
        }
    }

    private static readonly ConcurrentDictionary<string, CachedFrames?> _cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<IFlipbookTarget, Registration> _registrations = new();
    private static readonly List<Registration> _activeList = new();
    private static readonly DispatcherTimer _timer;
    private static readonly Stopwatch _clock = Stopwatch.StartNew();

    static FlipbookAnimationManager()
    {
        _timer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromMilliseconds(50)
        };
        _timer.Tick += OnTick;
    }

    /// <summary>
    /// Slices and caches square frames from a vertically-stacked sprite sheet.
    /// Uses frozen CroppedBitmap views sharing the underlying pixel buffer.
    /// </summary>
    public static CachedFrames? GetOrSliceFrames(string fullPath)
    {
        if (string.IsNullOrEmpty(fullPath) || !File.Exists(fullPath))
            return null;

        return _cache.GetOrAdd(fullPath, static p =>
        {
            try
            {
                var bitmap = ImagePathConverter.GetBitmap(p);
                if (bitmap == null || bitmap.PixelWidth <= 0 || bitmap.PixelHeight < bitmap.PixelWidth)
                    return null;

                int frameWidth = bitmap.PixelWidth;
                int frameCount = bitmap.PixelHeight / frameWidth;
                if (frameCount < 1)
                    return null;

                var frames = new BitmapSource[frameCount];
                for (int i = 0; i < frameCount; i++)
                {
                    var rect = new Int32Rect(0, i * frameWidth, frameWidth, frameWidth);
                    var crop = new CroppedBitmap(bitmap, rect);
                    crop.Freeze();
                    frames[i] = crop;
                }

                return new CachedFrames(frames, frameWidth);
            }
            catch
            {
                return null;
            }
        });
    }

    /// <summary>
    /// Registers an active flipbook target (invoked when thumbnail control is Loaded).
    /// Supplies initial frame and starts the master animation timer.
    /// </summary>
    public static void Register(IFlipbookTarget target, string fullPath, FlipbookDefinition definition)
    {
        if (target == null || string.IsNullOrEmpty(fullPath))
            return;

        var cached = GetOrSliceFrames(fullPath);
        if (cached == null || cached.FrameCount == 0)
            return;

        var reg = new Registration(target, fullPath, definition, cached);

        // Calculate and apply the current active synchronized frame immediately based on the running clock
        // so recycled virtualized items never hitch or jump from frame 0 when scrolled into view
        int seqLen = reg.Sequence.Length;
        if (seqLen > 0)
        {
            double totalTicks = _clock.Elapsed.TotalSeconds * 20.0;
            double stepFloat = totalTicks / reg.TicksPerFrame;
            long currentStep = (long)Math.Floor(stepFloat);
            int idxA = (int)((currentStep % seqLen + seqLen) % seqLen);
            int frameA = reg.Sequence[idxA];
            reg.LastFrameIndex = frameA;

            if (reg.BlendFrames)
            {
                double progress = Math.Clamp(stepFloat - currentStep, 0.0, 1.0);
                int idxB = (int)(((currentStep + 1) % seqLen + seqLen) % seqLen);
                int frameB = reg.Sequence[idxB];
                target.UpdateBlendedFrame(cached.Frames[frameA], cached.Frames[frameB], progress);
            }
            else
            {
                target.UpdateFrame(cached.Frames[frameA]);
            }
        }

        _registrations[target] = reg;

        UpdateTimerState();
    }

    /// <summary>
    /// Unregisters an active flipbook target (invoked when thumbnail control is Unloaded / virtualized).
    /// Adjusts timer frequency or stops the master loop when no targets remain active.
    /// </summary>
    public static void Unregister(IFlipbookTarget target)
    {
        if (target == null) return;

        _registrations.Remove(target);
        UpdateTimerState();
    }

    private static void UpdateTimerState()
    {
        if (_registrations.Count == 0)
        {
            if (_timer.IsEnabled) _timer.Stop();
            return;
        }

        bool hasBlending = false;
        foreach (var r in _registrations.Values)
        {
            if (r.BlendFrames)
            {
                hasBlending = true;
                break;
            }
        }

        // 16ms (~60 FPS) provides butter-smooth GPU crossfade blending matching native Bedrock client rendering;
        // 50ms (20 FPS) is exact 1:1 match for Bedrock integer game ticks for stepped animations
        var desiredInterval = hasBlending
            ? TimeSpan.FromMilliseconds(16)
            : TimeSpan.FromMilliseconds(50);

        if (_timer.Interval != desiredInterval)
            _timer.Interval = desiredInterval;

        if (!_timer.IsEnabled)
            _timer.Start();
    }

    /// <summary>
    /// Clears cached frame slices and resets registrations. Call after pack rescan.
    /// </summary>
    public static void ClearCache()
    {
        _timer.Stop();
        _registrations.Clear();
        _activeList.Clear();
        _cache.Clear();
    }

    private static void OnTick(object? sender, EventArgs e)
    {
        if (_registrations.Count == 0)
        {
            _timer.Stop();
            return;
        }

        // Exact continuous Bedrock game ticks (20 ticks per second)
        double totalTicks = _clock.Elapsed.TotalSeconds * 20.0;

        _activeList.Clear();
        _activeList.AddRange(_registrations.Values);

        for (int i = 0; i < _activeList.Count; i++)
        {
            var reg = _activeList[i];
            int seqLen = reg.Sequence.Length;
            if (seqLen == 0) continue;

            double stepFloat = totalTicks / reg.TicksPerFrame;
            long currentStep = (long)Math.Floor(stepFloat);

            int idxA = (int)((currentStep % seqLen + seqLen) % seqLen);
            int frameA = reg.Sequence[idxA];

            if (reg.BlendFrames)
            {
                double progress = Math.Clamp(stepFloat - currentStep, 0.0, 1.0);
                int idxB = (int)(((currentStep + 1) % seqLen + seqLen) % seqLen);
                int frameB = reg.Sequence[idxB];

                reg.Target.UpdateBlendedFrame(
                    reg.Frames.Frames[frameA],
                    reg.Frames.Frames[frameB],
                    progress
                );
            }
            else
            {
                if (frameA != reg.LastFrameIndex)
                {
                    reg.LastFrameIndex = frameA;
                    reg.Target.UpdateFrame(reg.Frames.Frames[frameA]);
                }
            }
        }
    }
}
