import { useQuery } from "@tanstack/react-query";
import type { AdminAccessContext, AdminPermissionCode } from "@shared/models/organisations";
import { getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export function useAdminAccess() {
  const { isAuthenticated } = useAuth();
  const query = useQuery<AdminAccessContext>({
    queryKey: ["/api/admin/access"],
    queryFn: getQueryFn<AdminAccessContext>({ on401: "throw" }),
    retry: false,
    staleTime: 60_000,
    enabled: isAuthenticated,
  });

  return {
    ...query,
    hasPermission: (permission: AdminPermissionCode) =>
      Boolean(query.data?.hasAccess && query.data.permissions.includes(permission)),
  };
}
