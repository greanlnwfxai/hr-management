import React from 'react';
import { act, create } from 'react-test-renderer';
import { useHomeSummaries } from './useHomeSummaries';

const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

const mockSignOut = jest.fn();
jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', signOut: mockSignOut }),
}));

const mockGetMyAttendance = jest.fn();
const mockGetMyLeaveBalance = jest.fn();
const mockGetMyLeaveRequests = jest.fn();
jest.mock('../api/client', () => ({
  getMyAttendance: (...args: unknown[]) => mockGetMyAttendance(...args),
  getMyLeaveBalance: (...args: unknown[]) => mockGetMyLeaveBalance(...args),
  getMyLeaveRequests: (...args: unknown[]) => mockGetMyLeaveRequests(...args),
}));

const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 1 } };

function Harness({ onState }: { onState: (state: ReturnType<typeof useHomeSummaries>) => void }) {
  const state = useHomeSummaries();
  onState(state);
  return null;
}

async function renderHook() {
  let latest: ReturnType<typeof useHomeSummaries>;
  const onState = (state: ReturnType<typeof useHomeSummaries>) => {
    latest = state;
  };
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(<Harness onState={onState} />);
  });
  return {
    getState: () => latest,
    rerender: async () => {
      await act(async () => {
        root.update(<Harness onState={onState} />);
      });
    },
  };
}

beforeEach(() => {
  mockSignOut.mockReset();
  mockGetMyAttendance.mockReset();
  mockGetMyLeaveBalance.mockReset();
  mockGetMyLeaveRequests.mockReset();
});

describe('useHomeSummaries', () => {
  it('reaches success state with fetched data', async () => {
    mockGetMyAttendance.mockResolvedValue(emptyPage);
    mockGetMyLeaveBalance.mockResolvedValue(emptyPage);
    mockGetMyLeaveRequests.mockResolvedValue(emptyPage);

    const { getState } = await renderHook();

    expect(getState().loadState).toBe('success');
    expect(getState().error).toBeNull();
  });

  it('reaches error state with a safe message when a fetch fails, without zeroing out as a false success', async () => {
    mockGetMyAttendance.mockRejectedValue(new Error('ไม่สามารถโหลดข้อมูลได้: HTTP 500'));
    mockGetMyLeaveBalance.mockResolvedValue(emptyPage);
    mockGetMyLeaveRequests.mockResolvedValue(emptyPage);

    const { getState } = await renderHook();

    expect(getState().loadState).toBe('error');
    expect(getState().error).toBe('ไม่สามารถโหลดข้อมูลได้: HTTP 500');
  });

  it('recovers to success after calling refresh() following a failure', async () => {
    mockGetMyAttendance.mockRejectedValueOnce(new Error('ไม่สามารถโหลดข้อมูลได้: HTTP 500'));
    mockGetMyLeaveBalance.mockResolvedValue(emptyPage);
    mockGetMyLeaveRequests.mockResolvedValue(emptyPage);

    const { getState, rerender } = await renderHook();
    expect(getState().loadState).toBe('error');

    mockGetMyAttendance.mockResolvedValue(emptyPage);

    await act(async () => {
      getState().refresh();
    });
    await rerender();

    expect(getState().loadState).toBe('success');
    expect(getState().error).toBeNull();
  });
});
