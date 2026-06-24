/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function isActiveCall() {
  const url = location.href;
  if (/^https:\/\/app\.zoom\.us\/wc\//.test(url)) return true;
  if (/^https:\/\/meet\.google\.com\/[a-z]+-[a-z]+-[a-z]+/.test(url)) return true;
  if (/^https:\/\/teams\.microsoft\.com\/(meet|light-meetings)\//.test(url)) return true;
  if (/^https:\/\/[^/]*\.webex\.com\/(wc|meet)\//.test(url)) return true;
  if (/^https:\/\/meet\.jit\.si\/.+/.test(url)) return true;
  return false;
}

if (isActiveCall()) {
  window.addEventListener('beforeunload', e => {
    e.preventDefault();
    return (e.returnValue = '');
  });
}
