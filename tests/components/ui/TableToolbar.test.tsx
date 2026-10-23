import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableToolbar } from '../../../src/components/ui/TableToolbar';
import { useDatabase } from '../../../src/hooks/useDatabase';

vi.mock('../../../src/hooks/useDatabase', () => ({
  useDatabase: vi.fn(),
}));

describe('TableToolbar', () => {
  const mockOnUpdate = vi.fn();
  const defaultProps = {
    placeholderColumn: 'id',
    placeholderSort: 'created_at',
    defaultLimit: 100,
    onUpdate: mockOnUpdate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDatabase).mockReturnValue({
      activeDriver: null,
    } as ReturnType<typeof useDatabase>);
  });

  it('renders with default state', () => {
    render(<TableToolbar {...defaultProps} />);

    expect(screen.getByText('WHERE')).toBeInTheDocument();
    expect(screen.getByText('ORDER BY')).toBeInTheDocument();
    expect(screen.getByText('LIMIT')).toBeInTheDocument();
  });

  it('renders with initial values', () => {
    render(
      <TableToolbar
        {...defaultProps}
        initialFilter="id > 5"
        initialSort="name ASC"
        initialLimit={50}
      />
    );

    expect(screen.getByDisplayValue('id > 5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('name ASC')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('shows placeholders correctly', () => {
    render(<TableToolbar {...defaultProps} />);

    const whereInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    const orderInput = screen.getByPlaceholderText('created_at DESC');

    expect(whereInput).toBeInTheDocument();
    expect(orderInput).toBeInTheDocument();
  });

  it('updates filter input on change', () => {
    render(<TableToolbar {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    fireEvent.change(filterInput, { target: { value: 'status = \'active\'' } });

    expect(filterInput).toHaveValue('status = \'active\'');
  });

  it('updates sort input on change', () => {
    render(<TableToolbar {...defaultProps} />);

    const sortInput = screen.getByPlaceholderText('created_at DESC');
    fireEvent.change(sortInput, { target: { value: 'name ASC' } });

    expect(sortInput).toHaveValue('name ASC');
  });

  it('updates limit input on change', () => {
    render(<TableToolbar {...defaultProps} />);

    const limitInput = screen.getByPlaceholderText('100');
    fireEvent.change(limitInput, { target: { value: '50' } });

    expect(limitInput).toHaveValue(50);
  });

  it('calls onUpdate when pressing Enter in filter input', () => {
    render(<TableToolbar {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    fireEvent.change(filterInput, { target: { value: 'id > 10' } });
    fireEvent.keyDown(filterInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'id > 10', sort: '', limit: undefined }),
    );
  });

  it('calls onUpdate when pressing Enter in sort input', () => {
    render(<TableToolbar {...defaultProps} />);

    const sortInput = screen.getByPlaceholderText('created_at DESC');
    fireEvent.change(sortInput, { target: { value: 'name DESC' } });
    fireEvent.keyDown(sortInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '', sort: 'name DESC', limit: undefined }),
    );
  });

  it('quotes sort column on commit for postgres driver', () => {
    vi.mocked(useDatabase).mockReturnValue({
      activeDriver: 'postgres',
    } as ReturnType<typeof useDatabase>);

    render(<TableToolbar {...defaultProps} />);

    const sortInput = screen.getByPlaceholderText('created_at DESC');
    fireEvent.change(sortInput, { target: { value: 'Status DESC' } });
    fireEvent.keyDown(sortInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '', sort: '"Status" DESC', limit: undefined }),
    );
  });

  it('calls onUpdate when pressing Enter in limit input', () => {
    render(<TableToolbar {...defaultProps} />);

    const limitInput = screen.getByPlaceholderText('100');
    fireEvent.change(limitInput, { target: { value: '25' } });
    fireEvent.keyDown(limitInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '', sort: '', limit: 25 }),
    );
  });

  it('does NOT call onUpdate on blur (avoids clearing the table with a half-typed clause)', () => {
    render(<TableToolbar {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    fireEvent.change(filterInput, { target: { value: 'status = 1' } });
    fireEvent.blur(filterInput);

    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('commits via the Apply button, not on blur', () => {
    render(<TableToolbar {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    fireEvent.change(filterInput, { target: { value: 'status = 1' } });
    fireEvent.blur(filterInput);
    expect(mockOnUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('toolbar.applyHint'));
    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'status = 1', sort: '', limit: undefined }),
    );
  });

  it('disables the Apply button until there are unapplied changes', () => {
    render(<TableToolbar {...defaultProps} initialFilter="id > 5" />);

    const applyBtn = screen.getByTitle('toolbar.applyHint');
    expect(applyBtn).toBeDisabled();

    const filterInput = screen.getByDisplayValue('id > 5');
    fireEvent.change(filterInput, { target: { value: 'id > 9' } });
    expect(applyBtn).toBeEnabled();
  });

  it('does not call onUpdate when values have not changed', () => {
    render(
      <TableToolbar
        {...defaultProps}
        initialFilter="existing filter"
      />
    );

    const filterInput = screen.getByDisplayValue('existing filter');
    fireEvent.blur(filterInput);

    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('does not call onUpdate on sort blur when clause only differs by postgres quoting', () => {
    vi.mocked(useDatabase).mockReturnValue({
      activeDriver: 'postgres',
    } as ReturnType<typeof useDatabase>);

    render(
      <TableToolbar
        {...defaultProps}
        initialSort="Status DESC"
      />
    );

    const sortInput = screen.getByDisplayValue('Status DESC');
    fireEvent.blur(sortInput);

    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('resets component when key changes', () => {
    const { rerender } = render(
      <TableToolbar
        {...defaultProps}
        initialFilter="filter1"
        initialSort="sort1"
        initialLimit={50}
      />
    );

    expect(screen.getByDisplayValue('filter1')).toBeInTheDocument();

    // Rerender with different key (simulated by changing initial values)
    rerender(
      <TableToolbar
        {...defaultProps}
        initialFilter="filter2"
        initialSort="sort2"
        initialLimit={100}
      />
    );

    expect(screen.getByDisplayValue('filter2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sort2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
  });

  it('handles limit input clearing', () => {
    render(
      <TableToolbar 
        {...defaultProps} 
        initialLimit={50}
      />
    );

    // Clear the limit input
    const limitInput = screen.getByDisplayValue('50');
    fireEvent.change(limitInput, { target: { value: '' } });
    fireEvent.keyDown(limitInput, { key: 'Enter' });

    // When cleared, onUpdate should be called with undefined
    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '', sort: '', limit: undefined }),
    );
  });

  it('has correct CSS classes on container', () => {
    const { container } = render(<TableToolbar {...defaultProps} />);

    // The outer wrapper is relative-positioned; the actual toolbar bar is the first child of it
    const wrapper = container.firstChild as HTMLElement;
    const toolbar = wrapper.firstChild as HTMLElement;
    expect(toolbar).toHaveClass('h-10');
    expect(toolbar).toHaveClass('bg-elevated');
    expect(toolbar).toHaveClass('border-y');
    expect(toolbar).toHaveClass('border-default');
  });

  it('renders three input sections', () => {
    render(<TableToolbar {...defaultProps} />);

    const sections = screen.getAllByText(/WHERE|ORDER BY|LIMIT/);
    expect(sections).toHaveLength(3);
  });

  it('limit input accepts only numbers', () => {
    render(<TableToolbar {...defaultProps} />);

    const limitInput = screen.getByPlaceholderText('100');
    expect(limitInput).toHaveAttribute('type', 'number');
  });

  it('handles initialLimit of 0 correctly', () => {
    render(
      <TableToolbar
        {...defaultProps}
        initialLimit={0}
      />
    );

    const limitInput = screen.getByPlaceholderText('100');
    // When initialLimit is 0 or undefined, the input shows empty string
    expect(limitInput).toHaveValue(null); // Empty number input has null value
  });

  const textColumns = [
    { name: 'id', data_type: 'INTEGER', is_pk: true, is_nullable: false, is_auto_increment: true },
    { name: 'name', data_type: 'VARCHAR', is_pk: false, is_nullable: true, is_auto_increment: false },
    { name: 'email', data_type: 'TEXT', is_pk: false, is_nullable: true, is_auto_increment: false },
  ];

  it('reveals the advanced row and runs a global search across text columns', () => {
    render(<TableToolbar {...defaultProps} columnMetadata={textColumns} />);

    // Advanced row hidden initially
    expect(screen.queryByText('SEARCH')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('toolbar.advanced'));
    expect(screen.getByText('SEARCH')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('toolbar.searchAllColumns');
    fireEvent.change(searchInput, { target: { value: 'foo' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "(name LIKE '%foo%' OR email LIKE '%foo%')",
        sort: '',
        limit: undefined,
      }),
    );
  });

  it('disables global search when there are no text columns', () => {
    const numericOnly = [
      { name: 'id', data_type: 'INTEGER', is_pk: true, is_nullable: false, is_auto_increment: true },
    ];
    render(<TableToolbar {...defaultProps} columnMetadata={numericOnly} />);

    fireEvent.click(screen.getByTitle('toolbar.advanced'));
    const searchInput = screen.getByPlaceholderText('toolbar.noTextColumns');
    expect(searchInput).toBeDisabled();
  });

  it('applies DISTINCT immediately when toggled', () => {
    render(<TableToolbar {...defaultProps} columnMetadata={textColumns} />);

    fireEvent.click(screen.getByTitle('toolbar.advanced'));
    fireEvent.click(screen.getByTitle('toolbar.distinctHint'));

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: true }),
    );
  });

  it('applies OFFSET together with the current LIMIT on Enter', () => {
    render(
      <TableToolbar {...defaultProps} columnMetadata={textColumns} initialLimit={50} />,
    );

    fireEvent.click(screen.getByTitle('toolbar.advanced'));
    const offsetInput = screen.getByTitle('toolbar.offsetHint');
    fireEvent.change(offsetInput, { target: { value: '20' } });
    fireEvent.keyDown(offsetInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 20 }),
    );
  });

  it('marks the toolbar dirty when only DISTINCT/OFFSET change', () => {
    render(
      <TableToolbar {...defaultProps} columnMetadata={textColumns} initialLimit={50} />,
    );

    const applyBtn = screen.getByTitle('toolbar.applyHint');
    expect(applyBtn).toBeDisabled();

    fireEvent.click(screen.getByTitle('toolbar.advanced'));
    const offsetInput = screen.getByTitle('toolbar.offsetHint');
    fireEvent.change(offsetInput, { target: { value: '5' } });
    expect(applyBtn).toBeEnabled();
  });

  it('updates all fields and commits on Enter in any field', () => {
    render(<TableToolbar {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('id > 5 AND status = \'active\'');
    const sortInput = screen.getByPlaceholderText('created_at DESC');
    const limitInput = screen.getByPlaceholderText('100');

    fireEvent.change(filterInput, { target: { value: 'id = 1' } });
    fireEvent.change(sortInput, { target: { value: 'id ASC' } });
    fireEvent.change(limitInput, { target: { value: '10' } });
    
    fireEvent.keyDown(filterInput, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'id = 1', sort: 'id ASC', limit: 10 }),
    );
  });

  it('calls onRefresh when clicking the refresh button', () => {
    const mockOnRefresh = vi.fn();
    render(<TableToolbar {...defaultProps} onRefresh={mockOnRefresh} />);

    const refreshBtn = screen.getByTitle('toolbar.refresh');
    expect(refreshBtn).toBeInTheDocument();
    fireEvent.click(refreshBtn);

    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh button when isLoading is true', () => {
    const mockOnRefresh = vi.fn();
    render(<TableToolbar {...defaultProps} onRefresh={mockOnRefresh} isLoading={true} />);

    const refreshBtn = screen.getByTitle('toolbar.refresh');
    expect(refreshBtn).toBeDisabled();
  });
});
