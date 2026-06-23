import React, { useCallback, useMemo } from "react";
import {
  ResponsiveDataTable,
  type ResponsiveTableConfig,
} from "@/components/ui/responsive-data-table";
import {
  ResponsiveTableProvider,
  useResponsiveTableContext,
} from "@/components/ui/responsive-table";
import type { Resource } from "../types";
import {
  ResourceExpandedRow,
  createResourcesColumns,
  type ResourcesTableActions,
} from "../utils/resources-table-utils";

interface EnhancedResourcesTableProps {
  data: Resource[];
  selectedResources?: string[];
  onSelectionChange?: (resourceIds: string[]) => void;
  onEditResource: (resourceId: string) => void;
  onDeleteResource: (resourceId: string) => void;
}

export function EnhancedResourcesTable(props: EnhancedResourcesTableProps) {
  return (
    <ResponsiveTableProvider tableType="resources">
      <EnhancedResourcesTableContent {...props} />
    </ResponsiveTableProvider>
  );
}

function EnhancedResourcesTableContent({
  data,
  selectedResources = [],
  onSelectionChange,
  onEditResource,
  onDeleteResource,
}: EnhancedResourcesTableProps) {
  const { visibleColumns } = useResponsiveTableContext();
  const [internalSelection, setInternalSelection] = React.useState<string[]>([]);
  const isControlledSelection = typeof onSelectionChange === "function";
  const selection = isControlledSelection ? selectedResources : internalSelection;
  const actions: ResourcesTableActions = useMemo(
    () => ({
      onEditResource: (resource: Resource) => onEditResource(resource.id),
      onDeleteResource: (resource: Resource) => onDeleteResource(resource.id),
    }),
    [onEditResource, onDeleteResource]
  );

  const columns = useMemo(() => {
    const baseColumns = createResourcesColumns(actions);
    return baseColumns.filter((column) => {
      const columnId = column.id;
      if (!columnId) return true;
      if (Object.prototype.hasOwnProperty.call(visibleColumns, columnId)) {
        return (visibleColumns as Record<string, boolean>)[columnId];
      }
      return true;
    });
  }, [actions, visibleColumns]);

  const handleRowSelectionChange = useCallback(
    (ids: string[]) => {
      if (isControlledSelection) {
        onSelectionChange?.(ids);
      } else {
        setInternalSelection(ids);
      }
    },
    [isControlledSelection, onSelectionChange]
  );

  const tableConfig: ResponsiveTableConfig<Resource> = {
    data: Array.isArray(data) ? data : [],
    columns,
    features: {
      selection: true,
      dragDrop: false,
      expandable: true,
      pagination: true,
      sorting: true,
      resizing: true,
    },
    pagination: {
      pageSize: 10,
      pageSizeOptions: [5, 10, 25, 50, 100],
      alwaysVisible: true,
    },
    selectedRowIds: selection,
    onRowSelectionChange: handleRowSelectionChange,
    renderExpandedRow: (row) => (
      <ResourceExpandedRow resource={row.original} />
    ),
    getRowId: (row) => row.id,
  };

  return (
    <>
      <ResponsiveDataTable {...tableConfig} />
    </>
  );
}

export default EnhancedResourcesTable;
