import { ProjectSelector } from "@/components/ProjectSelector";
import { Label } from "flowbite-react";

export function ProjectsSection() {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2">
                <Label>Current Project</Label>
                <ProjectSelector />
            </div>
        </div>
    );
}
