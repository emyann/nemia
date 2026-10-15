import type { ReactNode } from 'react';
import { tabsOf } from '@/components/nav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * The frame's strip of Settings' tabs (`SETTINGS_TABS`), under the top bar and above the page at `path`, which it holds as `children` in
 * the selected tab's panel; a page with one view is drawn bare, without a strip. Each tab is a link to its own address, so a link and a reload open the same
 * tab, and the root's `RouterProvider` navigates it once, for a click and for Enter alike. The arrow keys move between the tabs without
 * opening one (`keyboardActivation="manual"`). On a narrow screen the strip scrolls sideways.
 */
export function FrameTabs({ path, children }: { path: string; children: ReactNode }) {
  const tabs = tabsOf(path);
  if (tabs === undefined) return children;
  return (
    <Tabs selectedKey={path} keyboardActivation="manual" className="flex-1 gap-0">
      <div className="overflow-x-auto border-b px-4">
        <TabsList variant="line" aria-label="Settings" className="h-10!">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.to} id={tab.to} href={tab.to} className="flex-none px-2">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent id={path} className="text-[length:inherit]">
        {children}
      </TabsContent>
    </Tabs>
  );
}
