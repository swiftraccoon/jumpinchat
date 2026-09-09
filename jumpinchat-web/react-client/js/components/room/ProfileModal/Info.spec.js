import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProfileInfo from './Info.react';

describe('profile identity', () => {
  it('uses guest handle and prefers a registered username when available', () => {
    const { container, rerender } = render(<ProfileInfo profile={{ handle: 'Guest' }} />); expect(container).toHaveTextContent('Guest is a guest user');
    rerender(<ProfileInfo profile={{ handle: 'Handle', username: 'alice', userType: 'registered user' }} />); expect(container).toHaveTextContent('alice is a registered user');
  });
});
