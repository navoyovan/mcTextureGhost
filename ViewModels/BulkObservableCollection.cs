using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;

namespace McTextureGhost.ViewModels;

/// <summary>
/// An ObservableCollection that supports batch updates (ReplaceRange, AddRange)
/// with a single NotifyCollectionChangedAction.Reset event, avoiding thousands
/// of individual CollectionChanged notifications during large rescans.
/// </summary>
public class BulkObservableCollection<T> : ObservableCollection<T>
{
    private bool _suppressNotification;

    public BulkObservableCollection() : base() { }

    public BulkObservableCollection(IEnumerable<T> collection) : base(collection) { }

    public BulkObservableCollection(List<T> list) : base(list) { }

    public List<T> ToSnapshotList()
    {
        lock (this)
        {
            return new List<T>(Items);
        }
    }

    /// <summary>
    /// Atomically replaces the contents of the collection with the provided items,
    /// firing only a single Reset notification when finished.
    /// </summary>
    public void ReplaceRange(IEnumerable<T>? items)
    {
        lock (this)
        {
            _suppressNotification = true;
            try
            {
                Items.Clear();
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        Items.Add(item);
                    }
                }
            }
            finally
            {
                _suppressNotification = false;
            }
        }

        OnPropertyChanged(new PropertyChangedEventArgs(nameof(Count)));
        OnPropertyChanged(new PropertyChangedEventArgs("Item[]"));
        OnCollectionChanged(new NotifyCollectionChangedEventArgs(NotifyCollectionChangedAction.Reset));
    }

    /// <summary>
    /// Adds a range of items to the end of the collection, firing only a single Reset notification.
    /// </summary>
    public void AddRange(IEnumerable<T>? items)
    {
        if (items == null) return;
        lock (this)
        {
            _suppressNotification = true;
            try
            {
                foreach (var item in items)
                {
                    Items.Add(item);
                }
            }
            finally
            {
                _suppressNotification = false;
            }
        }

        OnPropertyChanged(new PropertyChangedEventArgs(nameof(Count)));
        OnPropertyChanged(new PropertyChangedEventArgs("Item[]"));
        OnCollectionChanged(new NotifyCollectionChangedEventArgs(NotifyCollectionChangedAction.Reset));
    }

    protected override void OnCollectionChanged(NotifyCollectionChangedEventArgs e)
    {
        if (!_suppressNotification)
        {
            base.OnCollectionChanged(e);
        }
    }

    protected override void OnPropertyChanged(PropertyChangedEventArgs e)
    {
        if (!_suppressNotification)
        {
            base.OnPropertyChanged(e);
        }
    }
}
