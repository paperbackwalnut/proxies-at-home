import { ProjectSelector } from "@/components/ProjectSelector";
import { Label } from "flowbite-react";

export function ProjectsSection() {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <Label>Current Project</Label>
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("open-projects"))}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    >
                        View all projects
                    </button>
                </div>
                <ProjectSelector />
            </div>
        </div>
    );
}
