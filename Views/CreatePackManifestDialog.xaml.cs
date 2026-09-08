using System.Windows;
using McTextureGhost.Models;

namespace McTextureGhost.Views;

public partial class CreatePackManifestDialog : Wpf.Ui.Controls.FluentWindow
{
    public ManifestModel Manifest { get; }
    public bool ShouldGenerateManifest { get; private set; }

    public CreatePackManifestDialog(ManifestModel manifest)
    {
        InitializeComponent();
        Manifest = manifest;
        DataContext = Manifest;
    }

    private void RegenerateHeaderUuid_Click(object sender, RoutedEventArgs e)
    {
        Manifest.RegenerateHeaderUuid();
    }

    private void RegenerateModuleUuid_Click(object sender, RoutedEventArgs e)
    {
        Manifest.RegenerateModuleUuid();
    }

    private void Generate_Click(object sender, RoutedEventArgs e)
    {
        ShouldGenerateManifest = true;
        DialogResult = true;
        Close();
    }

    private void Skip_Click(object sender, RoutedEventArgs e)
    {
        ShouldGenerateManifest = false;
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
