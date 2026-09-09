using System.Windows;
using McTextureGhost.ViewModels;

namespace McTextureGhost.Views;

public partial class CatalogDialog : Wpf.Ui.Controls.FluentWindow
{
    public CatalogDialog(MainViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
