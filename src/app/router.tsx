import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
import { CampaignsPage } from "../pages/CampaignsPage";
import { CreateLinkPage } from "../pages/CreateLinkPage";
import { HistoryPage } from "../pages/HistoryPage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { SettingsPage } from "../pages/SettingsPage";
import { StartPage } from "../pages/StartPage";
import { LinkTemplatePage } from "../pages/LinkTemplatePage";

export const router = createBrowserRouter([
  {
    path: "/start",
    element: <StartPage />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "dashboard",
        element: <ProjectDashboardPage />,
      },
      {
        path: "create-link",
        element: <CreateLinkPage />,
      },
      {
        path: "template",
        element: <LinkTemplatePage />,
      },
      {
        path: "campaigns",
        element: <CampaignsPage />,
      },
      {
        path: "history",
        element: <HistoryPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);

