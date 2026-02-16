/* global document */

import Tether from 'tether';
import $ from 'jquery';

const profileButton = $('#profile-drop-trigger');
const profileDropdown = $('#profile-drop-container');
if (profileButton.length) {
  const profileTether = new Tether({
    element: profileDropdown,
    target: profileButton,
    attachment: 'top center',
    targetAttachment: 'bottom center',
    offset: '-5px 0',
    enabled: true,
    constraints: [
      {
        to: 'scrollParent',
        attachment: 'together',
        pin: true,
      },
      {
        to: 'window',
        attachment: 'together',
      },
    ],
  });

  $(window).on('click', () => {
    profileDropdown.hide();
  });

  profileButton.on('click', (e) => {
    e.stopPropagation();
    profileDropdown.toggle();
    profileTether.enable();
  });
}
