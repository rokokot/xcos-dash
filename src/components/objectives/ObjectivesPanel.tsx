/**
 * Objectives Panel - Configure and monitor global and local scheduling objectives
 */
import { useState, useRef, useEffect } from 'react';
import { TrendingUp, MapPin, Plus, X, GripHorizontal } from 'lucide-react';
import { GlobalObjective, LocalObjective, ObjectiveScores } from '../../types/objectives';

export interface ObjectivesPanelProps {
  globalObjectives: GlobalObjective[];
  localObjectives: LocalObjective[];
  scores?: ObjectiveScores;
  onGlobalObjectiveToggle?: (id: string, enabled: boolean) => void;
  onGlobalObjectiveWeightChange?: (id: string, weight: number) => void;
  onLocalObjectiveRemove?: (id: string) => void;
  onLocalObjectiveAdd?: () => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  positioning?: 'fixed' | 'relative';
  comparisonMode?: boolean;
  rosterLabels?: string[];
}

export function ObjectivesPanel({
  globalObjectives,
  localObjectives,
  scores,
  onGlobalObjectiveToggle,
  onGlobalObjectiveWeightChange,
  onLocalObjectiveRemove,
  onLocalObjectiveAdd,
  isExpanded,
  onToggleExpanded: _onToggleExpanded,
  positioning = 'relative',
  comparisonMode = false,
  rosterLabels = [],
}: ObjectivesPanelProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'local'>('global');
  const [panelHeight, setPanelHeight] = useState(525); // Default height in pixels (50% higher than 350)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const positionClasses = positioning === 'fixed'
    ? 'fixed bottom-0 left-0 right-0'
    : 'relative w-full';

  // Handle resize drag - optimized with RAF for smoother performance
  useEffect(() => {
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Use requestAnimationFrame to throttle updates
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        const deltaY = dragStartY.current - e.clientY;
        const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, dragStartHeight.current + deltaY));
        setPanelHeight(newHeight);
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
  };

  return (
    <div
      className={`${positionClasses} bg-white border-t border-gray-200 shadow-lg ${isDragging ? '' : 'transition-all duration-300 ease-in-out'} z-20`}
      style={{ height: isExpanded ? `${panelHeight}px` : '0px' }}
    >
      {/* Resize handle */}
      {isExpanded && (
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-100 active:bg-blue-200 flex items-center justify-center group"
          onMouseDown={handleDragStart}
          style={{ zIndex: 100 }}
        >
          <GripHorizontal className="h-3 w-3 text-gray-400 group-hover:text-blue-600" />
        </div>
      )}

      {/* Content */}
      {isExpanded && (
        <div className="h-full pt-2 flex flex-col">
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab('global')}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'global'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Global Objectives
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                {globalObjectives.filter(o => o.enabled).length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('local')}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'local'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Local Objectives
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                {localObjectives.length}
              </span>
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {comparisonMode && rosterLabels.length > 1 ? (
              // Comparison view
              <div className="space-y-4">
                <div className="text-sm font-medium text-gray-700 mb-3">
                  Comparing: {rosterLabels.join(' vs ')}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">
                          Objective
                        </th>
                        {rosterLabels.map((label, idx) => (
                          <th key={idx} className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-b">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {globalObjectives.filter(o => o.enabled).map((objective, idx) => (
                        <tr key={objective.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-gray-900">{objective.label}</td>
                          {rosterLabels.map((_, labelIdx) => (
                            <td key={labelIdx} className="px-3 py-2 text-center text-gray-600">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                                —
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                      {localObjectives.length > 0 && (
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={rosterLabels.length + 1} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50">
                            Local Objectives
                          </td>
                        </tr>
                      )}
                      {localObjectives.map((objective, idx) => (
                        <tr key={objective.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-gray-900">{objective.label}</td>
                          {rosterLabels.map((_, labelIdx) => (
                            <td key={labelIdx} className="px-3 py-2 text-center text-gray-600">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                                —
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Objective scores will be calculated when solver is integrated
                </p>
              </div>
            ) : activeTab === 'global' ? (
              <div className="space-y-3">
                {globalObjectives.map(objective => (
                  <div
                    key={objective.id}
                    className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={objective.enabled}
                          onChange={(e) => onGlobalObjectiveToggle?.(objective.id, e.target.checked)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">{objective.label}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{objective.description}</div>
                        </div>
                      </div>
                      {scores?.global[objective.id] !== undefined && objective.enabled && (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded">
                          {scores.global[objective.id]}
                        </span>
                      )}
                    </div>
                    {objective.enabled && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-600">Weight:</span>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={objective.weight}
                          onChange={(e) => onGlobalObjectiveWeightChange?.(objective.id, parseInt(e.target.value))}
                          className="w-1/5"
                        />
                        <span className="text-xs font-medium text-gray-700 w-8">{objective.weight}/10</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {localObjectives.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No local objectives defined</p>
                    <p className="text-xs mt-1">Select defenses in the schedule to create local objectives</p>
                  </div>
                ) : (
                  localObjectives.map(objective => (
                    <div
                      key={objective.id}
                      className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-blue-600" />
                            <span className="font-medium text-sm text-gray-900">{objective.label}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1 capitalize">
                            {objective.type.replace(/-/g, ' ')}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {objective.defenseIds.length} defense{objective.defenseIds.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {scores?.local[objective.id] !== undefined && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded">
                              {scores.local[objective.id]}
                            </span>
                          )}
                          <button
                            onClick={() => onLocalObjectiveRemove?.(objective.id)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-600">Weight:</span>
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${(objective.weight / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-8">{objective.weight}/10</span>
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={onLocalObjectiveAdd}
                  className="w-full py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Local Objective
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
