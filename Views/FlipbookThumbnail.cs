using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using McTextureGhost.Models;
using McTextureGhost.Services;

namespace McTextureGhost.Views;

/// <summary>
/// High-performance thumbnail control for Minecraft textures.
/// Renders authentic NearestNeighbor pixel art, supporting both static blocks
/// and Bedrock flipbook animated textures with custom frame sequences and seamless frame blending.
/// </summary>
public class FlipbookThumbnail : Grid, IFlipbookTarget
{
    private readonly Image _baseImage;
    private readonly Image _blendImage;

    public static readonly DependencyProperty TextureProperty =
        DependencyProperty.Register(
            nameof(Texture),
            typeof(TextureAlias),
            typeof(FlipbookThumbnail),
            new PropertyMetadata(null, OnTextureChanged));

    public TextureAlias? Texture
    {
        get => (TextureAlias?)GetValue(TextureProperty);
        set => SetValue(TextureProperty, value);
    }

    public static readonly DependencyProperty StretchProperty =
        DependencyProperty.Register(
            nameof(Stretch),
            typeof(Stretch),
            typeof(FlipbookThumbnail),
            new PropertyMetadata(Stretch.Uniform, (d, e) =>
            {
                if (d is FlipbookThumbnail control && e.NewValue is Stretch s)
                {
                    control._baseImage.Stretch = s;
                    control._blendImage.Stretch = s;
                }
            }));

    public Stretch Stretch
    {
        get => (Stretch)GetValue(StretchProperty);
        set => SetValue(StretchProperty, value);
    }

    public FlipbookThumbnail()
    {
        SnapsToDevicePixels = true;
        UseLayoutRounding = true;

        _baseImage = new Image
        {
            Stretch = Stretch.Uniform,
            SnapsToDevicePixels = true,
            UseLayoutRounding = true
        };
        RenderOptions.SetBitmapScalingMode(_baseImage, BitmapScalingMode.NearestNeighbor);
        RenderOptions.SetEdgeMode(_baseImage, EdgeMode.Aliased);

        _blendImage = new Image
        {
            Stretch = Stretch.Uniform,
            SnapsToDevicePixels = true,
            UseLayoutRounding = true,
            Opacity = 0.0,
            IsHitTestVisible = false
        };
        RenderOptions.SetBitmapScalingMode(_blendImage, BitmapScalingMode.NearestNeighbor);
        RenderOptions.SetEdgeMode(_blendImage, EdgeMode.Aliased);

        Children.Add(_baseImage);
        Children.Add(_blendImage);

        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private static void OnTextureChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is FlipbookThumbnail control)
        {
            control.ApplyTexture();
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        ApplyTexture();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        FlipbookAnimationManager.Unregister(this);
    }

    private void ApplyTexture()
    {
        var tex = Texture;
        if (tex == null || !tex.ShowsImageThumbnail)
        {
            FlipbookAnimationManager.Unregister(this);
            _baseImage.Source = null;
            _baseImage.Opacity = 1.0;
            _blendImage.Source = null;
            _blendImage.Opacity = 0.0;
            return;
        }

        if (tex.IsFlipbook && tex.Flipbook != null)
        {
            // Slices or retrieves square frame immediately so the thumbnail never displays a squished sprite sheet
            var cached = FlipbookAnimationManager.GetOrSliceFrames(tex.FullPath);
            if (cached != null && cached.FrameCount > 0)
            {
                int firstFrame = (tex.Flipbook.Frames != null && tex.Flipbook.Frames.Length > 0)
                    ? tex.Flipbook.Frames[0]
                    : 0;
                if (firstFrame < 0 || firstFrame >= cached.FrameCount) firstFrame = 0;
                _baseImage.Source = cached.Frames[firstFrame];
            }
            else
            {
                _baseImage.Source = ImagePathConverter.GetBitmap(tex.FullPath);
            }
            _baseImage.Opacity = 1.0;
            _blendImage.Source = null;
            _blendImage.Opacity = 0.0;

            if (IsLoaded)
            {
                FlipbookAnimationManager.Register(this, tex.FullPath, tex.Flipbook);
            }
        }
        else
        {
            FlipbookAnimationManager.Unregister(this);
            _baseImage.Source = ImagePathConverter.GetBitmap(tex.FullPath);
            _baseImage.Opacity = 1.0;
            _blendImage.Source = null;
            _blendImage.Opacity = 0.0;
        }
    }

    public void UpdateFrame(BitmapSource frame)
    {
        if (!ReferenceEquals(_baseImage.Source, frame))
            _baseImage.Source = frame;
        if (_baseImage.Opacity != 1.0)
            _baseImage.Opacity = 1.0;

        if (_blendImage.Opacity != 0.0)
        {
            _blendImage.Opacity = 0.0;
            _blendImage.Source = null;
        }
    }

    public void UpdateBlendedFrame(BitmapSource frameA, BitmapSource frameB, double progress)
    {
        if (progress < 0.0) progress = 0.0;
        else if (progress > 1.0) progress = 1.0;

        // Static hold or edge frame: hide overlay image completely to avoid compositing overhead
        if (ReferenceEquals(frameA, frameB) || progress <= 0.001)
        {
            if (!ReferenceEquals(_baseImage.Source, frameA))
                _baseImage.Source = frameA;
            if (_baseImage.Opacity != 1.0)
                _baseImage.Opacity = 1.0;

            if (_blendImage.Opacity != 0.0)
            {
                _blendImage.Opacity = 0.0;
                _blendImage.Source = null;
            }
            return;
        }

        if (progress >= 0.999)
        {
            if (!ReferenceEquals(_baseImage.Source, frameB))
                _baseImage.Source = frameB;
            if (_baseImage.Opacity != 1.0)
                _baseImage.Opacity = 1.0;

            if (_blendImage.Opacity != 0.0)
            {
                _blendImage.Opacity = 0.0;
                _blendImage.Source = null;
            }
            return;
        }

        // Seamless 1:1 GPU crossfade:
        // Keep base image rock-solid at 100% opacity so total opacity is always 1.0 (zero background bleed/darkening dip).
        // The blend image layered on top with opacity `progress` linearly interpolates:
        // Result = progress * frameB + (1.0 - progress) * frameA.
        if (!ReferenceEquals(_baseImage.Source, frameA))
            _baseImage.Source = frameA;
        if (_baseImage.Opacity != 1.0)
            _baseImage.Opacity = 1.0;

        if (!ReferenceEquals(_blendImage.Source, frameB))
            _blendImage.Source = frameB;
        _blendImage.Opacity = progress;
    }
}
