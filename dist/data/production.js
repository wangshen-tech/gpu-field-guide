window.GPU_PRODUCTION = [
  {
    id: "linux-debugging",
    title: "Linux, topology & incident debugging",
    group: "Production",
    level: "Intermediate",
    minutes: 40,
    summary: "Follow the evidence from a slow or failed request through the process, host memory, PCIe path, driver and GPU.",
    tags: ["Linux", "NUMA", "PCIe", "OOM", "debugging"],
    objectives: ["Separate host, container and device memory failures", "Read topology before tuning data movement", "Build a reproducible incident evidence bundle"],
    sections: [
      { heading: "Start with a layered hypothesis", body: "A GPU application spans storage, CPU preprocessing, host memory, a driver, transfer engines and device kernels. Record the exact symptom, first occurrence, workload shape and recent change. Ask whether the slowdown affects one process, one model, one device or every job on the host. Preserve a known-good baseline. A clean framework exception, a terminated Linux process and a machine that no longer responds point toward different investigations." },
      { heading: "Read the machine's topology", body: "PCIe connects devices through root complexes and switches; link generation and lane width bound transfer capacity, but advertised peak bandwidth is not application throughput. NUMA associates CPU cores with nearby memory. A data loader running far from its buffers or GPU can introduce extra traffic. Inspect nvidia-smi topo -m, lscpu and numactl --hardware where available. Treat topology as a hypothesis for a measured locality experiment, not a reason to bind every process blindly." },
      { heading: "Three different out-of-memory stories", body: "CUDA allocation failure concerns device memory; inspect live tensors, peak allocation, allocator reservations and other processes. Linux host exhaustion concerns resident memory, page cache, pinned buffers and loader workers. A container can hit its cgroup limit while the host still has free RAM. On cgroup v2, inspect the workload's memory.current, memory.max and memory.events; rising oom_kill provides evidence of process termination. Do not interpret exit status 137 alone as proof of OOM." },
      { heading: "Find starvation and synchronization", body: "A GPU can wait while CPUs decode samples, storage misses cache, a queue empties or Python serializes work. Compare CPU saturation, I/O wait, queue depth and GPU timelines over the same interval. Frequent device-to-host scalar reads can synchronize execution. High host CPU usage can also come from excessive thread pools competing with loader workers. Change one bottleneck at a time, and confirm that end-to-end latency or throughput improves." },
      { heading: "Investigate hangs without losing evidence", body: "First determine whether useful progress stopped or one operation became unusually long. Capture process stacks, timestamps, application logs and accessible kernel messages. CUDA work is asynchronous, so an error may surface after its original launch. A small reproduction with additional synchronization can localize it, but changes timing. Xid messages are diagnostic clues requiring their documented context; one code is not a universal verdict that hardware has failed." },
      { heading: "Write an actionable incident report", body: "Include GPU UUID, driver and framework versions, workload revision, input dimensions, dtype, memory peaks, relevant logs and a minimal reproduction. Separate observations from suspected causes. Record which experiments falsified hypotheses and which recovery steps worked. Driver reloads, GPU resets and host reboots affect other workloads and belong in the operator's recovery procedure. A strong report explains the causal chain and a verification plan for the eventual fix." }
    ],
    lab: {
      title: "Collect a read-only Linux inventory",
      steps: ["Use a Linux GPU host you are authorized to inspect; these commands do not require resetting a device.", "Run each available command and record unsupported tools or fields as unavailable.", "Compare CPU locality, GPU identity and current memory use; write two hypotheses for a hypothetical slow data loader."],
      code: "# Read-only shell commands; tools may be absent on your host.\nuname -sr\nlscpu\nnvidia-smi --query-gpu=uuid,name,driver_version,memory.total,memory.used --format=csv\nnvidia-smi topo -m\ncat /proc/meminfo\ncat /proc/self/cgroup\n# Optional, if numactl is installed:\nnumactl --hardware",
      success: "You can identify the GPU and CPU topology and explain why GPU free memory cannot rule out a host or cgroup OOM."
    },
    quiz: { question: "A container is killed while the host has ample RAM. What should you inspect next?", choices: ["Only GPU clock frequency", "Its cgroup memory limit and memory.events", "The monitor's refresh rate", "Only the model's parameter count"], answer: 1, explanation: "A cgroup can exhaust its allowed host memory independently of total host RAM. Check the relevant workload cgroup and logs before concluding the cause." },
    sources: [
      { label: "Linux kernel: cgroup v2 memory controller", url: "https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html" },
      { label: "NVIDIA: nvidia-smi reference", url: "https://docs.nvidia.com/deploy/nvidia-smi/" },
      { label: "NVIDIA: GPU node triage", url: "https://docs.nvidia.com/deploy/gpu-debug-guidelines/gpu-node-triage.html" }
    ]
  },
  {
    id: "containers-scheduling",
    title: "Containers, scheduling & GPU sharing",
    group: "Production",
    level: "Advanced",
    minutes: 45,
    summary: "Connect the container runtime to cluster scheduling, then choose an explicit resource and isolation contract.",
    tags: ["containers", "Kubernetes", "MIG", "MPS", "scheduling"],
    objectives: ["Explain the driver, runtime and device-plugin responsibilities", "Distinguish exclusive devices, MIG, MPS and time-slicing", "Reason about placement, admission and noisy neighbors"],
    sections: [
      { heading: "The container boundary", body: "A container packages application dependencies while sharing the host kernel. GPU access additionally needs compatible host driver support and device exposure through the runtime. NVIDIA Container Toolkit provides components for GPU-enabled containers. A CUDA image alone does not install or replace the running host kernel driver. Record the image digest, driver and user-space library versions together. Reproducing only the Python requirements misses an important part of the execution environment." },
      { heading: "How scheduling sees a GPU", body: "A device plugin advertises specialized resources to Kubernetes and helps kubelet expose allocated devices. The scheduler matches a Pod's declared needs against node capacity and placement constraints. In the conventional extended-resource path, GPU counts are integers; if requests and limits are both specified, they must match. CPU, RAM and storage requirements still matter. A Pod requesting a GPU may remain pending because of capacity, labels, taints, affinity or another unsatisfied resource." },
      { heading: "Exclusive access and hardware partitions", body: "An exclusively allocated full GPU offers a simple ownership model, though the host and surrounding infrastructure still need isolation. On supported products, MIG creates predefined hardware instances with dedicated compute and memory resources and hardware memory and fault isolation. Profiles, supported combinations and operational behavior depend on the GPU generation. An instance is a capacity commitment: a workload that exceeds its memory cannot borrow the rest of the card automatically." },
      { heading: "Software sharing has different guarantees", body: "Time-slicing interleaves workloads and increases advertised access slots; those slots are not extra physical GPUs, fixed memory slices or proportional compute guarantees. MPS coordinates concurrent CUDA processes and can enforce configured resource limits, depending on integration. Neither should be described as equivalent to MIG's hardware partitioning. NVIDIA's Kubernetes plugin documents specific MPS restrictions. Choose the sharing mode from workload trust, memory demand, latency sensitivity and interference measurements rather than utilization alone." },
      { heading: "Placement is a systems problem", body: "A useful scheduler considers device type, available memory, CPU locality, storage access, job priority and expected duration. Queueing and admission control prevent overload before it turns into OOM or tail-latency collapse. For online inference, reserving headroom can be more valuable than packing every allocation tightly. For batch training, fairness and preemption may dominate. Multi-GPU jobs add gang scheduling and topology constraints; those are extensions of the same resource contract." },
      { heading: "Define the tenant contract", body: "Publish what a resource request promises: exclusive device, named MIG profile, or shared access. State whether memory limits and performance are guaranteed and how failures affect neighbors. Add least-privilege identity, image policy, quotas and workload-specific observability around the GPU mechanism. A container namespace alone is not a complete security boundary for hostile code. Validate sharing with concurrent realistic workloads and measure each tenant's latency, throughput and failure behavior." }
    ],
    lab: {
      title: "Audit an allocation contract offline",
      steps: ["Run the local Python model; it does not contact or modify a cluster.", "Change replicas from four to eight and observe what changes and what stays fixed.", "Write a resource description that avoids promising extra physical memory."],
      code: "# Python 3: conceptual capacity accounting, not a scheduler.\nphysical_gpus = 2\nreplicas = 4\nmemory_gib_per_gpu = 24\nadvertised_shared_slots = physical_gpus * replicas\nprint('Physical GPUs:', physical_gpus)\nprint('Shared access slots:', advertised_shared_slots)\nprint('Physical device memory GiB:', physical_gpus * memory_gib_per_gpu)\nprint('Time-slicing guarantees no per-slot memory partition.')",
      success: "You can explain why eight advertised shared slots on two GPUs do not provide eight GPUs' memory or eight isolated fault domains."
    },
    quiz: { question: "Which statement about time-sliced GPU replicas is correct?", choices: ["Each replica receives a dedicated memory partition", "Each replica is a separate physical GPU", "Replicas grant shared access without MIG-style memory and fault isolation", "Requesting twice as many replicas guarantees twice the throughput"], answer: 2, explanation: "Time-slicing multiplexes the underlying device. Advertised replicas express access slots, not isolated memory capacity or proportional performance." },
    sources: [
      { label: "Kubernetes: schedule GPUs", url: "https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/" },
      { label: "NVIDIA: Kubernetes device plugin and sharing", url: "https://github.com/NVIDIA/k8s-device-plugin" },
      { label: "NVIDIA: MIG concepts and supported hardware", url: "https://docs.nvidia.com/datacenter/tesla/mig-user-guide/latest/" }
    ]
  },
  {
    id: "observability",
    title: "Observability, latency & service objectives",
    group: "Production",
    level: "Intermediate",
    minutes: 35,
    summary: "Measure what users experience, then use GPU telemetry and traces to explain the result.",
    tags: ["DCGM", "Prometheus", "SLO", "latency", "metrics"],
    objectives: ["Distinguish device activity from useful application work", "Define latency and availability indicators precisely", "Connect service symptoms to resource telemetry"],
    sections: [
      { heading: "Begin at the request boundary", body: "Track arrival rate, successful completions, errors, cancellations and latency at a clearly defined boundary. For streaming generation, time to first token describes initial responsiveness, while inter-token latency describes the subsequent stream. End-to-end duration also depends on output length. Specify whether queueing, network transfer and retries are included. Compare similar prompt and output distributions so a changing workload mix does not masquerade as a kernel regression." },
      { heading: "Utilization does not equal efficiency", body: "A GPU activity percentage tells you something about a sampling interval, not whether the device achieved its compute or bandwidth potential. A tiny repeated kernel can keep a device active without doing much useful work. Memory allocated measures capacity occupancy, not memory traffic. Relate GPU activity, memory bandwidth, tensor activity, power and clocks to tokens per second or training steps per second. Investigate the workload phase before calling a value good or bad." },
      { heading: "From DCGM to application traces", body: "DCGM exposes device health and performance telemetry that an exporter can make available to Prometheus. It supports fleet-level questions such as which device is unusual or when activity changed. Profiling counters are interval measurements rather than source-level explanations. Use a timeline profiler to identify CPU gaps, transfers and kernels, then a kernel profiler for detailed bottlenecks. Counter collection may conflict with other profiling tools, so coordinate shared-host investigations with the operator." },
      { heading: "Use distributions and careful labels", body: "Averages can hide a small but painful tail. Histograms preserve a distribution that can be aggregated across replicas; calculate percentiles from the combined distribution instead of averaging replica percentiles. Classic histogram buckets need boundaries suitable for the latency objective. Keep labels bounded, such as model revision, deployment and result class. User IDs, request IDs and arbitrary prompt text create cardinality and privacy problems; put appropriate correlation identifiers in controlled traces instead." },
      { heading: "Make an SLO actionable", body: "Define the fraction of eligible requests that satisfy a specific success and latency condition over a stated window. For example, an illustrative objective might count successful requests with a first token within a chosen deadline, excluding only explicitly documented cases. The remaining allowed bad fraction is an error budget. Alerts should identify sustained or rapid budget consumption and a concrete response, rather than page whenever GPU utilization crosses an arbitrary threshold." },
      { heading: "Build a causal dashboard", body: "Place user outcomes beside queue depth, active requests, batch size, KV-cache occupancy, model-loading time and hardware health. Add deployment annotations and compare before-and-after traffic. Missing telemetry and stale scrapes must not appear as healthy zeroes. During an incident, follow the sequence: identify affected users, locate the time window, compare replicas, inspect resource constraints, and test a hypothesis. A dashboard is useful when it shortens a decision, not because it contains many charts." }
    ],
    lab: {
      title: "Compute an SLI from a tiny fixture",
      steps: ["Run the Python fixture locally; its values are illustrative, not benchmark measurements.", "Change the latency threshold and calculate the good-request fraction again.", "Explain why failed requests stay in the denominator for this SLI."],
      code: "# Python 3: illustrative request records, no GPU required.\nrequests = [(True, 0.12), (True, 0.19), (False, 0.08),\n            (True, 0.31), (True, 0.15)]\nthreshold_seconds = 0.25\ngood = sum(ok and latency <= threshold_seconds\n           for ok, latency in requests)\nsli = good / len(requests)\nprint(f'Good requests: {good}/{len(requests)}; SLI: {sli:.1%}')",
      success: "You get a 60% good-request fraction and can distinguish this request-based SLI from GPU utilization and average latency."
    },
    quiz: { question: "How should you calculate fleet p95 latency from replica histograms?", choices: ["Average every replica's p95", "Use the maximum GPU utilization", "Divide mean latency by 0.95", "Aggregate compatible histogram observations, then calculate p95"], answer: 3, explanation: "Percentiles are not additive. Combine compatible distributions first; then estimate the requested percentile from the aggregate." },
    sources: [
      { label: "NVIDIA DCGM: profiling metrics", url: "https://docs.nvidia.com/datacenter/dcgm/latest/learn/modules/profiling.html" },
      { label: "Prometheus: histograms and summaries", url: "https://prometheus.io/docs/practices/histograms/" },
      { label: "Google SRE: implementing SLOs", url: "https://sre.google/workbook/implementing-slos/" }
    ]
  },
  {
    id: "reliability-security",
    title: "Reliability, reproducibility & secure operation",
    group: "Production",
    level: "Advanced",
    minutes: 40,
    summary: "Treat recovery, experiment identity and tenancy boundaries as part of the design of a GPU service.",
    tags: ["ECC", "Xid", "checkpoints", "security", "reproducibility"],
    objectives: ["Design a checkpoint and recovery contract", "Separate hardware health signals from diagnosis", "Make artifacts and experiments traceable"],
    sections: [
      { heading: "Failures are part of the workload", body: "A long job can fail because of invalid inputs, software bugs, resource exhaustion, network loss, host failure or a GPU problem. Classify failures before deciding whether retrying is useful. Bounded retries with backoff can recover a transient dependency outage; unlimited retries of a deterministic invalid operation waste capacity. Serving systems need request deadlines, admission limits and cancellation propagation. Training systems need a precise definition of which progress is durable." },
      { heading: "Interpret ECC and Xid carefully", body: "ECC detects or corrects certain memory errors on supported hardware; support and reporting vary by product. A corrected event, an uncorrectable event and a retired or remapped memory region have different operational implications. Xid logs describe driver-detected conditions with documented diagnostic paths. Correlate timestamps, workload behavior and device identity, and retain evidence for the owner. Recovery might require application restart or operator action; do not turn a single counter into an automatic hardware-replacement conclusion." },
      { heading: "A checkpoint is more than weights", body: "To resume training meaningfully, capture model parameters, optimizer state, scheduler state, step position and relevant random-number generator states. Data iteration state and sampler behavior also affect replay. Write a new checkpoint separately, verify completion and integrity, then publish the reference that marks it usable. Test restoration into a fresh process. Select a checkpoint interval by balancing write overhead against expected lost progress, and include storage failures in that calculation." },
      { heading: "Reproducibility has levels", body: "Record code revision, immutable model and dataset versions, image digest, driver, framework, dtype, compiler settings and seeds. Equal seeds do not guarantee identical outputs across releases, devices or execution paths. Deterministic modes can constrain algorithm choice and may change performance. Decide whether your contract is bitwise replay, numeric agreement within tolerance, or comparable statistical quality. Test the contract you need and report it alongside benchmark results so readers understand what comparison is justified." },
      { heading: "Protect the whole execution path", body: "Model artifacts, Python dependencies, container images and custom kernels are all inputs to the software supply chain. Pin expected artifacts, verify available signatures or provenance, scan dependencies and keep a record of what was built. A digest identifies bytes; it does not prove that those bytes are trustworthy. Avoid loading untrusted executable serialization or enabling remote model code by habit. Keep service credentials scoped and separate from public benchmark logs." },
      { heading: "Define safe tenancy and change management", body: "Use an explicit trust model for co-tenants, data sensitivity and allowed device access. GPU sharing mechanisms do not remove the need for operating-system and network controls. Run canaries against correctness and latency gates before broad rollout, retain a compatible rollback artifact and rehearse recovery. Limit changes to one understandable unit where practical. The operational deliverable is a tested runbook describing detection, ownership, recovery, verification and prevention, with evidence from a scoped exercise." }
    ],
    lab: {
      title: "Verify a local checkpoint handoff",
      steps: ["Run the standard-library Python example; all writes stay in a temporary directory.", "Read the saved file and verify its recorded digest before accepting it.", "List the additional state a real training checkpoint would need."],
      code: "# Python 3: tiny JSON stand-in, not a model checkpoint format.\nfrom pathlib import Path\nfrom tempfile import TemporaryDirectory\nimport hashlib, json\nwith TemporaryDirectory() as folder:\n    path = Path(folder) / 'checkpoint.json'\n    payload = json.dumps({'step': 42, 'revision': 'example'}).encode()\n    path.write_bytes(payload)\n    expected = hashlib.sha256(payload).hexdigest()\n    restored = path.read_bytes()\n    assert hashlib.sha256(restored).hexdigest() == expected\n    print('Verified state:', json.loads(restored))",
      success: "You verify byte integrity and explain why integrity alone proves neither artifact trustworthiness nor complete training reproducibility."
    },
    quiz: { question: "Which statement about a fixed random seed is correct?", choices: ["It guarantees identical results on all GPU generations", "It controls one source of variability but does not guarantee cross-environment reproducibility", "It replaces recording software versions", "It makes optimizer checkpoints unnecessary"], answer: 1, explanation: "Seeds help control randomness, while algorithm selection, numerical behavior, software revisions and hardware can still affect results." },
    sources: [
      { label: "NVIDIA: Xid error documentation", url: "https://docs.nvidia.com/deploy/xid-errors/latest/" },
      { label: "PyTorch: reproducibility", url: "https://docs.pytorch.org/docs/stable/notes/randomness.html" },
      { label: "SLSA: artifact provenance", url: "https://slsa.dev/spec/v1.2/provenance" }
    ]
  },
  {
    id: "distributed-bridge",
    title: "The bridge from one GPU to a fleet",
    group: "Production",
    level: "Advanced",
    minutes: 50,
    summary: "Extend the single-device cost model to communication, parallelism, storage and the cluster control plane.",
    tags: ["NCCL", "RDMA", "NVLink", "FSDP", "distributed"],
    objectives: ["Match parallelism strategies to capacity and communication needs", "Explain the main collective operations", "Identify data-plane and control-plane bottlenecks"],
    sections: [
      { heading: "Preserve the single-GPU baseline", body: "Before scaling out, know one device's step time, memory peak, input cost and achieved throughput for a fixed workload. Adding workers changes global batch size, communication and failure probability. Strong scaling holds total work fixed; weak scaling increases work with resources. Report speedup and efficiency with those assumptions. A distributed job that is faster per step may still be worse in cost or time to target model quality." },
      { heading: "Choose what to partition", body: "Data parallelism replicates the model and divides samples, then synchronizes gradients. Tensor parallelism partitions operations and introduces communication inside model layers. Pipeline parallelism assigns stages to devices, using microbatches to reduce idle pipeline time. FSDP shards training state and gathers parameters when needed, trading communication for memory capacity. Expert parallelism routes tokens among experts. Choose from the actual memory shortfall, available topology and communication frequency; combining strategies introduces additional coordination complexity." },
      { heading: "Know the collective vocabulary", body: "All-reduce combines values across ranks and returns the reduced result to every participant. All-gather assembles each rank's contribution everywhere. Reduce-scatter reduces contributions and leaves a shard of the result on each rank. All-to-all exchanges different pieces between peers. NCCL provides GPU communication primitives, but correctness still requires compatible collective participation and ordering. One rank taking a different code path can leave others waiting even when the network is healthy." },
      { heading: "Topology becomes part of the algorithm", body: "PCIe and NVLink offer different intra-system paths; available links and peer-access behavior depend on hardware. Across hosts, Ethernet or InfiniBand transport, NIC placement and congestion matter. RDMA can reduce CPU involvement, and GPUDirect RDMA can enable transfers between supported peer devices and GPU memory. This is conditional on hardware, drivers and topology. A headline link rate cannot predict collective throughput without considering message size, routing, protocol overhead and competing traffic." },
      { heading: "Storage and control-plane work remain", body: "Dataset sharding, local caching, metadata operations and checkpoint writes can dominate even when collectives are fast. Measure sustained delivery and recovery behavior, not only a storage vendor's bandwidth specification. The control plane handles admission, identity, placement, configuration, health and lifecycle; the data plane performs model work and transfers tensors. Avoid making every token depend on a central control service. Model downloads and cold starts also influence autoscaling decisions and available capacity." },
      { heading: "Debug the first divergence", body: "For a distributed hang, compare each rank's last completed phase, input shape, collective sequence and error log. A crashed process, uneven data exhaustion or mismatched call may look like a network timeout elsewhere. Establish a tiny correct run, then scale one dimension at a time. Capture communication/computation overlap in a timeline. Reason about stragglers, checkpoint consistency and job-level recovery before treating the single-GPU program as a production distributed system." }
    ],
    lab: {
      title: "Model collective semantics without GPUs",
      steps: ["Run this pure-Python three-rank example locally.", "Confirm that reduce-scatter followed by all-gather reconstructs the sum all-reduce result.", "Explain which data is replicated at the end of each stage."],
      code: "# Python 3: semantic simulation, not a performance benchmark.\nranks = [[1, 2, 3, 4, 5, 6],\n         [10, 20, 30, 40, 50, 60],\n         [100, 200, 300, 400, 500, 600]]\nreduced = [sum(values) for values in zip(*ranks)]\nwidth = len(reduced) // len(ranks)\nshards = [reduced[i*width:(i+1)*width] for i in range(len(ranks))]\ngathered = [value for shard in shards for value in shard]\nassert gathered == reduced\nprint('Reduce-scatter shards:', shards)\nprint('All-reduce result on each rank:', gathered)",
      success: "You distinguish the shape and ownership of data after all-reduce, reduce-scatter and all-gather without mistaking this simulation for an NCCL benchmark."
    },
    quiz: { question: "What does FSDP primarily trade to reduce per-device training-state memory?", choices: ["Additional communication and coordination", "Removal of all gradients", "Guaranteed identical single-GPU step time", "Elimination of model parameters"], answer: 0, explanation: "Sharding reduces replicated state, while gathering parameters and communicating gradients introduce communication that may or may not overlap effectively with computation." },
    sources: [
      { label: "NVIDIA NCCL: collective operations", url: "https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html" },
      { label: "PyTorch: FSDP2 fully_shard", url: "https://docs.pytorch.org/docs/stable/distributed.fsdp.fully_shard.html" },
      { label: "NVIDIA: GPUDirect RDMA", url: "https://docs.nvidia.com/cuda/gpudirect-rdma/index.html" }
    ]
  },
  {
    id: "career-projects",
    title: "AI infrastructure career & portfolio",
    group: "Production",
    level: "Intermediate",
    minutes: 35,
    summary: "Turn GPU knowledge into measured projects, credible design decisions and evidence for an infrastructure role.",
    tags: ["career", "portfolio", "system design", "economics", "interviews"],
    objectives: ["Map role families to practical competencies", "Design a portfolio with measurable outcomes", "Explain capacity, cost and reliability tradeoffs"],
    sections: [
      { heading: "Know which role you are preparing for", body: "AI infrastructure is a family of roles. Kernel engineers emphasize parallel programming, numerical behavior and profiling. Training-platform engineers emphasize distributed execution, data delivery and recovery. Inference engineers emphasize serving runtimes, batching, cache management and latency. Platform and reliability engineers emphasize Linux, scheduling, automation, observability and secure operations. All benefit from programming fundamentals, networking, storage and clear communication. Build a broad foundation, then demonstrate depth in one area." },
      { heading: "Milestone one: explain a measured workload", body: "Create a repeatable single-GPU benchmark for one model or operator, with warmup, synchronized timing where appropriate, representative shapes and correctness checks. Record hardware, software, dtype and memory peaks. Profile the baseline, name the dominant bottleneck and change one variable. Publish the result with error bars or repeatability evidence and an explanation of what did not improve. A small, defensible experiment is stronger evidence than a large unsupported speedup claim." },
      { heading: "Milestone two: operate a service", body: "Build a local inference service with bounded inputs, request deadlines, a queue limit and basic health reporting. Replay a fixed traffic fixture at increasing offered load and report goodput: useful completions that satisfy the chosen service objective. Include initial response and streaming behavior if relevant. Document the saturation point and what happens to rejected requests. Add a reproducible environment and a dashboard or report explaining why the bottleneck moves as concurrency changes." },
      { heading: "Milestone three: design for failure", body: "Add a checkpoint-and-restore experiment or a scoped service restart exercise. Show detection, recovery time, lost progress and the correctness checks after recovery. Then write a design for a larger deployment with admission control, model distribution, autoscaling, tenant isolation and observability. Identify dependencies, failure domains and rollback strategy. You do not need access to a large cluster to state assumptions, estimate capacity and describe which measurements would validate the design." },
      { heading: "Connect engineering to serving economics", body: "Compute cost per useful request or output token using the full measured service boundary. Include idle capacity, CPU/RAM, storage, networking and operational overhead where relevant. Throughput measured under overload is not usable capacity when requests miss their deadlines. Account for startup time, demand variation and headroom. A cheaper device can be more expensive per successful result. Use current provider quotes for real budgets; portfolio calculations should label hypothetical prices and exclude unsupported precision." },
      { heading: "Practice evidence-based interview answers", body: "For system design, establish workload distribution, quality target, latency objective, availability and cost constraints before drawing components. Practice questions such as: Why is GPU utilization high but throughput low? Why did memory rise with context length? When does batching hurt? What changes when a model no longer fits one device? How would you investigate a collective hang? Answer with a causal model, measurements, alternatives and failure handling. End each project with limitations and the next experiment." }
    ],
    lab: {
      title: "Estimate cost per successful result",
      steps: ["Run the local calculator using explicitly hypothetical inputs.", "Reduce the fraction of requests meeting the objective and observe the effective unit cost.", "Add your own overhead categories before using the model for a real deployment decision."],
      code: "# Python 3: hypothetical costs, not cloud pricing.\nhourly_service_cost = 3.60\ncompleted_requests_per_second = 8.0\nfraction_meeting_slo = 0.90\ngoodput = completed_requests_per_second * fraction_meeting_slo\ncost_per_1000_good_requests = hourly_service_cost / (3600 * goodput) * 1000\nprint(f'Goodput: {goodput:.2f} requests/s')\nprint(f'Cost per 1,000 good requests: ${cost_per_1000_good_requests:.4f}')",
      success: "You can defend every assumption in a cost model and explain why peak tokens per second alone cannot determine production economics."
    },
    quiz: { question: "Which portfolio claim is most credible?", choices: ["The dashboard shows 100% GPU utilization", "The fastest run was 10 times faster without a baseline", "A reproducible benchmark improved goodput with unchanged quality and a documented latency objective", "The project uses the largest number of infrastructure tools"], answer: 2, explanation: "A defined workload, correctness target, service objective and reproducible comparison make an improvement meaningful to an infrastructure team." },
    sources: [
      { label: "Google SRE: concrete system design and capacity", url: "https://sre.google/workbook/non-abstract-design/" },
      { label: "vLLM: request and engine metrics", url: "https://docs.vllm.ai/en/latest/design/metrics/" },
      { label: "Google SRE: service objectives and error budgets", url: "https://sre.google/workbook/implementing-slos/" }
    ]
  }
];
