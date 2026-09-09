import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportModal from './ReportModal.react';
import { sendReport } from '../../../utils/RoomAPI';
import { setReportModal } from '../../../actions/ModalActions';
vi.mock('../../../utils/RoomAPI', () => ({ sendReport: vi.fn() }));
vi.mock('../../../actions/ModalActions', () => ({ setReportModal: vi.fn() }));
vi.mock('../../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));
const props = { isOpen: true, room: 'room', reporterId: 'me', targetId: 'bob', messages: [{ message: 'Evidence' }] };

describe('report form', () => {
  it('requires a reason before sending the visible conversation', () => {
    render(<ReportModal {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Select a reason')).toBeVisible(); expect(sendReport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.change(screen.getByLabelText('More information (optional)'), { target: { value: 'Details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendReport).toHaveBeenCalledWith('room', 'me', 'bob', 'harassment', 'Details', props.messages); expect(setReportModal).toHaveBeenCalledWith(false);
  });
  it('cancels without sending a report', () => {
    render(<ReportModal {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(setReportModal).toHaveBeenCalledWith(false); expect(sendReport).not.toHaveBeenCalled();
  });
});
