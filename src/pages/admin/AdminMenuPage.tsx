import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, FolderOpen, Plus, TrendingUp, UtensilsCrossed } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoFixAllButton } from "@/components/admin/AutoFixAllButton";
import { QuickVATUpdate } from "@/components/admin/QuickVATUpdate";
import { ImageOptimizerButton } from "@/components/admin/ImageOptimizerButton";
import { AdminMenuList } from "@/components/admin/AdminMenuList";
import { AdminMenuForm } from "@/components/admin/AdminMenuForm";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { AdminCategoryList } from "@/components/admin/AdminCategoryList";
import { AdminKnowledge } from "@/components/admin/AdminKnowledge";
import type { Category, MenuItem } from "@/type/type";

const TABS = ["items", "categories", "analytics", "knowledge"] as const;
type Tab = (typeof TABS)[number];

/** /admin/menu: dishes, categories, analytics and the AI knowledge base. */
export default function AdminMenuPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") === "menu" ? "items" : searchParams.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "items";
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => { void api.categories(true).then((result) => { if (active) setCategories(result.data); }).catch(() => undefined); };
    refresh();
    window.addEventListener("categorychange", refresh);
    return () => { active = false; window.removeEventListener("categorychange", refresh); };
  }, []);

  const closeForm = () => { setShowForm(false); setEditingItem(null); };

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-6">
      <Tabs value={tab} onValueChange={(value) => setSearchParams(value === "items" ? {} : { tab: value }, { replace: true })} className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-[#f3e8dc] p-1 sm:w-auto">
          <TabsTrigger value="items" className="rounded-xl"><UtensilsCrossed className="mr-2 h-4 w-4" />Menu items</TabsTrigger>
          <TabsTrigger value="categories" className="rounded-xl"><FolderOpen className="mr-2 h-4 w-4" />Categories</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-xl"><TrendingUp className="mr-2 h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="knowledge" className="rounded-xl"><Bot className="mr-2 h-4 w-4" />AI Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-6">
          {showForm ? (
            <AdminMenuForm editingItem={editingItem} onClose={closeForm} categories={categories} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Menu items</h2>
                <div className="flex flex-wrap gap-2">
                  <QuickVATUpdate categories={categories} />
                  <AutoFixAllButton />
                  <ImageOptimizerButton />
                  <Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Add item</Button>
                </div>
              </div>
              <AdminMenuList onEdit={(item) => { setEditingItem(item); setShowForm(true); }} categories={categories} />
            </>
          )}
        </TabsContent>
        <TabsContent value="categories"><AdminCategoryList /></TabsContent>
        <TabsContent value="analytics"><AdminAnalytics /></TabsContent>
        <TabsContent value="knowledge"><AdminKnowledge /></TabsContent>
      </Tabs>
    </main>
  );
}
