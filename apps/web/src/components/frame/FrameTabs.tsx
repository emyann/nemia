import type { ReactNode } from 'react';
import { tabsOf } from '@/components/nav/nav';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/ds';

/**
 * The frame's strip of Settings' tabs (`SETTINGS_TABS`), the kit's primary tabs under the top bar and above the page at `path`, which it
 * holds as `children` in the selected tab's panel; a page with one view is drawn bare, without a strip. Each tab is a link to its own
 * address, so a link and a reload open the same tab, and the root's `RouterProvider` navigates it once, for a click and for Enter alike.
 * The arrow keys move between the tabs without opening one (`keyboardActivation="manual"`). The tabs size to their labels, and on a
 * narrow screen the strip scrolls sideways (`isScrollable`). The panel adds no room of its own: the page keeps its own.
 */
export function FrameTabs({ path, children }: { path: string; children: ReactNode }) {
  const tabs = tabsOf(path);
  if (tabs === undefined) return children;
  return (
    <Tabs selectedKey={path} keyboardActivation="manual" className="flex-1">
      <div className="px-4">
        <TabList isScrollable aria-label="Settings">
          {tabs.map((tab) => (
            <Tab key={tab.to} id={tab.to} href={tab.to}>
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </div>
      <TabPanel id={path} className="py-0">
        {children}
      </TabPanel>
    </Tabs>
  );
}
