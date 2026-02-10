import React from 'react';
import { addDecorator  } from '@storybook/react';
import StyleWrapper from './StyleWrapper';

addDecorator(fn => <StyleWrapper>{fn()}</StyleWrapper>)
