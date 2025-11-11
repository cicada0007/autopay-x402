import { render, screen } from '@testing-library/react';

import DashboardPage from '@/app/page';

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: () => ({
      data: undefined,
      refetch: jest.fn().mockResolvedValue({ data: undefined })
    }),
    useQueryClient: () => ({
      invalidateQueries: jest.fn()
    })
  };
});

jest.mock('@/stores/useAgentStore', () => {
  const actual = jest.requireActual('@/stores/useAgentStore');
  return {
    ...actual,
    useAgentStore: jest.fn().mockReturnValue({
      autonomyPhase: 1,
      request: null,
      setRequest: jest.fn(),
      balance: 1.2,
      setBalance: jest.fn(),
      ledger: [],
      setLedger: jest.fn(),
      transactions: [],
      setTransactions: jest.fn()
    })
  };
});

describe('DashboardPage', () => {
  it('renders dashboard heading', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/x402 Autonomous Payment Dashboard/i)).toBeInTheDocument();
  });
});

